"""Blockchain event indexer — polls chain logs over HTTP and indexes
``StatementAdded`` and ``StatementEngaged`` events into Meilisearch.

Persists the next block cursor in Meilisearch so restarts continue where they
left off. Startup catch-up is intentionally capped to the latest 4 hours to
limit RPC usage spikes.

Stale documents (those whose ``lastEngagement`` is older than a configurable
TTL) are periodically evicted from the index.

Can be run standalone (``python -m symvolia.main``) or embedded in the combined
process via the ``run_indexer`` coroutine.
"""

import asyncio
import contextlib
import hashlib
import json
import logging
import os
import re
import time
from collections.abc import Sequence
from datetime import datetime, timedelta, timezone
from importlib.resources import files
from typing import Any

import meilisearch
from web3 import AsyncHTTPProvider, AsyncWeb3

from symvolia.search_query import STOP_WORDS

logger = logging.getLogger(__name__)


# Meilisearch index name for statements.
STATEMENTS_INDEX = "statements"
INDEXER_STATE_INDEX = "indexer_state"

# Optional semantic similarity support. Meilisearch downloads the configured
# Hugging Face model on first use and stores generated document embeddings.
SEMANTIC_EMBEDDER_NAME = os.getenv("MEILI_SEMANTIC_EMBEDDER_NAME", "statement-text")
SEMANTIC_EMBEDDER_MODEL = os.getenv(
    "MEILI_SEMANTIC_EMBEDDER_MODEL",
    "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
)
SEMANTIC_EMBEDDER_DOCUMENT_TEMPLATE = os.getenv(
    "MEILI_SEMANTIC_EMBEDDER_DOCUMENT_TEMPLATE", "{{doc.statementText}}"
)
MEILI_TASK_TIMEOUT_MS = int(os.getenv("MEILI_TASK_TIMEOUT_MS", "300000"))
MEILI_TASK_POLL_INTERVAL_MS = int(os.getenv("MEILI_TASK_POLL_INTERVAL_MS", "500"))

# Maximum number of blocks to request per ``get_logs`` call during catch-up.
_INDEX_RANGE_BATCH_SIZE = max(
    1,
    min(int(os.getenv("INDEXER_MAX_BLOCKS_PER_REQUEST", "600")), 2_000),
)

# Poll cadence for live indexing when no new blocks need processing.
_POLL_INTERVAL_SECONDS = max(30, int(os.getenv("INDEXER_POLL_INTERVAL_SECONDS", 300)))

# Hard cap for historical catch-up on startup.
_MAX_STARTUP_LOOKBACK_SECONDS = max(
    60,
    int(os.getenv("INDEXER_MAX_STARTUP_LOOKBACK_SECONDS", 4 * 60 * 60)),
)

# Default maximum age (in seconds) for documents without recent engagement.
# Documents whose ``lastEngagement`` is older than this are periodically
# evicted from the search index.  7 days = 604_800 seconds.
DEFAULT_EVICTION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60

# How often (in seconds) the eviction sweep runs.
_EVICTION_INTERVAL_SECONDS = 60 * 60  # 1 hour

# Event signature topics for a single-filter logs query.
_STATEMENT_ADDED_TOPIC = AsyncWeb3.keccak(
    text="StatementAdded(uint256,string)"
).hex()
_STATEMENT_ENGAGED_TOPIC = AsyncWeb3.keccak(text="StatementEngaged(uint256)").hex()


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def semantic_search_enabled() -> bool:
    return _env_bool("MEILI_SEMANTIC_SEARCH_ENABLED")


def _load_forum_abi() -> list[dict[str, Any]]:
    """Load the Forum ABI from the package data."""
    abi_path = files("symvolia").joinpath("ForumABI.json")
    return json.loads(abi_path.read_text())["abi"]


def _wait_task(
    index_or_client: Any,
    task_info: Any,
    description: str,
    *,
    raise_on_failure: bool = False,
) -> None:
    """Block until a Meilisearch task completes and log failures.

    Meilisearch operations (add_documents, update_documents,
    update_filterable_attributes, etc.) are enqueued as async server-side
    tasks and return a TaskInfo immediately.  Without waiting, the caller
    has no way to know whether the operation actually succeeded.

    Accepts either a ``meilisearch.Client`` or a ``meilisearch.Index``;
    both expose ``wait_for_task``.
    """
    result = index_or_client.wait_for_task(
        task_info.task_uid,
        timeout_in_ms=MEILI_TASK_TIMEOUT_MS,
        interval_in_ms=MEILI_TASK_POLL_INTERVAL_MS,
    )
    if result.status != "succeeded":
        message = (
            f"Meilisearch task failed [{description}]: "
            f"status={result.status} error={getattr(result, 'error', None)}"
        )
        logger.error(
            message,
        )
        if raise_on_failure:
            raise RuntimeError(message)
    else:
        logger.debug("Meilisearch task succeeded [%s]", description)


def _ensure_index(client: meilisearch.Client) -> None:
    """Create the statements index if it doesn't exist and configure searchable
    attributes."""
    try:
        client.get_index(STATEMENTS_INDEX)
    except meilisearch.errors.MeilisearchApiError:
        task = client.create_index(STATEMENTS_INDEX, {"primaryKey": "id"})
        _wait_task(client, task, "create_index", raise_on_failure=True)

    # Ensure searchable/filterable attributes are configured.
    _wait_task(
        client,
        client.index(STATEMENTS_INDEX).update_searchable_attributes(["statementText"]),
        "update_searchable_attributes",
        raise_on_failure=True,
    )
    _wait_task(
        client,
        client.index(STATEMENTS_INDEX).update_filterable_attributes(
            ["statementId", "lastEngagement", "forumAddress"]
        ),
        "update_filterable_attributes",
        raise_on_failure=True,
    )
    _wait_task(
        client,
        client.index(STATEMENTS_INDEX).update_sortable_attributes(["lastEngagement"]),
        "update_sortable_attributes",
        raise_on_failure=True,
    )

    # Configure stop words so common filler words don't dilute relevance
    # when users search with full sentences (e.g. "similar statements" flow).
    _wait_task(
        client,
        client.index(STATEMENTS_INDEX).update_stop_words(sorted(STOP_WORDS)),
        "update_stop_words",
        raise_on_failure=True,
    )

    if semantic_search_enabled():
        _wait_task(
            client,
            client.index(STATEMENTS_INDEX).update_embedders(
                {
                    SEMANTIC_EMBEDDER_NAME: {
                        "source": "huggingFace",
                        "model": SEMANTIC_EMBEDDER_MODEL,
                        "documentTemplate": SEMANTIC_EMBEDDER_DOCUMENT_TEMPLATE,
                    }
                }
            ),
            "update_embedders",
            raise_on_failure=True,
        )


def ensure_search_index(client: meilisearch.Client) -> None:
    """Ensure the Meilisearch statements index and settings are configured."""
    _ensure_index(client)


def _ensure_indexer_state_index(client: meilisearch.Client) -> None:
    """Ensure the index that stores persistent indexer cursors exists."""
    try:
        client.get_index(INDEXER_STATE_INDEX)
    except meilisearch.errors.MeilisearchApiError:
        task = client.create_index(INDEXER_STATE_INDEX, {"primaryKey": "id"})
        _wait_task(client, task, "create_indexer_state", raise_on_failure=True)


def _cursor_document_id(chain_id: int, forum_contract_addresses: Sequence[str]) -> str:
    addresses = ",".join(sorted(address.lower() for address in forum_contract_addresses))
    digest = hashlib.sha256(addresses.encode("utf-8")).hexdigest()[:16]
    return f"chain-{chain_id}-forums-{digest}"


def _read_persisted_cursor(
    client: meilisearch.Client,
    cursor_doc_id: str,
) -> int | None:
    """Return persisted next block cursor, if present."""
    try:
        doc = client.index(INDEXER_STATE_INDEX).get_document(cursor_doc_id)
    except meilisearch.errors.MeilisearchApiError:
        return None

    value = getattr(doc, "nextBlockToIndex", None)
    if value is None:
        return None

    try:
        return int(value)
    except (TypeError, ValueError):
        logger.warning(
            "Ignoring invalid persisted nextBlockToIndex=%r for %s",
            value,
            cursor_doc_id,
        )
        return None


def _persist_cursor(
    client: meilisearch.Client,
    cursor_doc_id: str,
    next_block_to_index: int,
) -> None:
    """Persist the next block the indexer should process."""
    task = client.index(INDEXER_STATE_INDEX).add_documents(
        [
            {
                "id": cursor_doc_id,
                "nextBlockToIndex": int(next_block_to_index),
                "updatedAt": datetime.now(tz=timezone.utc).isoformat(),
            }
        ]
    )
    _wait_task(client, task, "persist_indexer_cursor")


# ---------------------------------------------------------------------------
# Address helpers
# ---------------------------------------------------------------------------


def normalize_forum_contract_address(address: str) -> str:
    """Return a checksum-normalized forum contract address."""
    return AsyncWeb3.to_checksum_address(address.strip())


def parse_forum_contract_addresses(values: str | Sequence[str]) -> list[str]:
    """Parse one or more forum contract addresses from CLI/env inputs."""
    raw_values = [values] if isinstance(values, str) else list(values)
    addresses: list[str] = []
    seen: set[str] = set()
    for raw_value in raw_values:
        for candidate in re.split(r"[\s,]+", raw_value.strip()):
            if not candidate:
                continue
            normalized = normalize_forum_contract_address(candidate)
            address_key = normalized.lower()
            if address_key in seen:
                continue
            seen.add(address_key)
            addresses.append(normalized)
    return addresses


def statement_document_id(forum_contract_address: str, statement_id: int) -> str:
    """Build a document ID that remains unique across multiple forums."""
    return f"{forum_contract_address.lower()}-{statement_id}"


def _statement_document_id(forum_contract_address: str, statement_id: int) -> str:
    return statement_document_id(forum_contract_address, statement_id)


async def _find_block_by_timestamp(w3: AsyncWeb3, target_ts: int) -> int:
    """Find the first block whose timestamp >= *target_ts*.

    Bootstraps a block-time estimate from a small local sample, then
    iteratively jumps toward the target — refining the estimate after
    each hop using the actual time span traversed.  Once the remaining
    search window is small enough, finishes with a standard binary
    search.

    Falls back to block ``1`` if the target predates the chain.
    """
    latest = await w3.eth.get_block("latest")
    hi: int = latest["number"]
    if hi == 0:
        return 0

    genesis = await w3.eth.get_block(0)
    if target_ts <= genesis["timestamp"]:
        return 0
    if target_ts >= latest["timestamp"]:
        return hi

    # ── Iterative interpolation ────────────────────────────────────
    # Each hop jumps to where the target *should* be according to the
    # current block-time estimate, then refines the estimate using
    # the lo–hi window that brackets the target.
    lo, lo_ts = 0, genesis["timestamp"]
    hi, hi_ts = hi, latest["timestamp"]

    for _ in range(12):
        if hi - lo <= 16:
            break

        # Estimate block time across the current search window.
        avg_block_time = (hi_ts - lo_ts) / (hi - lo)
        if avg_block_time <= 0:
            break

        # Interpolate where the target should be within [lo, hi].
        blocks_away = int((target_ts - lo_ts) / avg_block_time)
        cand_num = max(lo, min(lo + blocks_away, hi))

        # Avoid stalling on the same block (fall back to midpoint).
        if cand_num == lo or cand_num == hi:
            cand_num = (lo + hi) // 2

        cand_block = await w3.eth.get_block(cand_num)
        cand_ts: int = cand_block["timestamp"]

        # Narrow the search window.
        if cand_ts < target_ts:
            lo, lo_ts = cand_num, cand_ts
        else:
            hi, hi_ts = cand_num, cand_ts

    # ── Binary search over the remaining narrow range ──────────────
    while lo < hi:
        mid = (lo + hi) // 2
        block = await w3.eth.get_block(mid)
        if block["timestamp"] < target_ts:
            lo = mid + 1
        else:
            hi = mid

    return lo


async def _latest_chain_block_number(w3: AsyncWeb3) -> int:
    """Return the latest block number from the connected chain."""
    return int((await w3.eth.get_block("latest"))["number"])


async def _initial_index_cursor(
    w3: AsyncWeb3,
    meili_client: meilisearch.Client,
    cursor_doc_id: str,
) -> int:
    """Resolve initial cursor using persisted state and configured lookback cap."""
    latest_block = await _latest_chain_block_number(w3)

    lookback_target_ts = int(
        (
            datetime.now(tz=timezone.utc)
            - timedelta(seconds=_MAX_STARTUP_LOOKBACK_SECONDS)
        ).timestamp()
    )
    lookback_block = await _find_block_by_timestamp(w3, lookback_target_ts)

    persisted_cursor = _read_persisted_cursor(meili_client, cursor_doc_id)
    if persisted_cursor is None:
        cursor = lookback_block
        logger.info(
            "No persisted cursor found; starting from lookback (%ss) block #%d",
            _MAX_STARTUP_LOOKBACK_SECONDS,
            cursor,
        )
    else:
        cursor = max(persisted_cursor, lookback_block)
        logger.info(
            "Loaded persisted cursor #%d; lookback (%ss) block is #%d; "
            "starting from #%d",
            persisted_cursor,
            _MAX_STARTUP_LOOKBACK_SECONDS,
            lookback_block,
            cursor,
        )

    # Never start beyond the next block after the current head.
    return min(cursor, latest_block + 1)


async def _engagement_docs(
    w3: AsyncWeb3,
    logs: list[Any],
    forum_contract_address: str,
) -> list[dict[str, Any]]:
    """Build Meilisearch partial-update documents for engagement events.

    Each document sets ``lastEngagement`` to the block timestamp (unix seconds).
    If multiple engagement events arrive in the same batch for the same
    statement, only the latest timestamp is kept.
    """
    # Collect unique block numbers to batch-fetch timestamps.
    block_numbers: set[int] = {log.blockNumber for log in logs}
    block_timestamps: dict[int, int] = {}
    for bn in block_numbers:
        block = await w3.eth.get_block(bn)
        block_timestamps[bn] = block["timestamp"]

    # Deduplicate: keep the latest engagement per statement.
    latest: dict[int, int] = {}  # statementId -> timestamp
    for log in logs:
        sid = log.args.statementId
        ts = block_timestamps[log.blockNumber]
        if sid not in latest or ts > latest[sid]:
            latest[sid] = ts

    return [
        {
            "id": _statement_document_id(forum_contract_address, sid),
            "lastEngagement": ts,
        }
        for sid, ts in latest.items()
    ]


async def _block_timestamps(w3: AsyncWeb3, block_numbers: set[int]) -> dict[int, int]:
    """Fetch unix timestamps for a set of block numbers."""
    timestamps: dict[int, int] = {}
    for block_number in block_numbers:
        block = await w3.eth.get_block(block_number)
        timestamps[block_number] = int(block["timestamp"])
    return timestamps


async def _index_forum_block_range(
    w3: AsyncWeb3,
    contract: Any,
    index: Any,
    forum_contract_address: str,
    from_block: int,
    to_block: int,
) -> None:
    """Index tracked events for one forum contract across a block range."""
    combined_logs = await w3.eth.get_logs(
        {
            "address": forum_contract_address,
            "fromBlock": from_block,
            "toBlock": to_block,
            "topics": [[_STATEMENT_ADDED_TOPIC, _STATEMENT_ENGAGED_TOPIC]],
        }
    )

    added_logs = []
    engaged_logs = []
    for log in combined_logs:
        first_topic = log["topics"][0].hex().lower()
        if first_topic == _STATEMENT_ADDED_TOPIC:
            added_logs.append(contract.events.StatementAdded().process_log(log))
        elif first_topic == _STATEMENT_ENGAGED_TOPIC:
            engaged_logs.append(contract.events.StatementEngaged().process_log(log))

    range_label = (
        f"block #{from_block}"
        if from_block == to_block
        else f"blocks #{from_block}-{to_block}"
    )

    if added_logs:
        added_block_timestamps = await _block_timestamps(
            w3,
            {log.blockNumber for log in added_logs},
        )
        docs = [
            {
                "id": _statement_document_id(
                    forum_contract_address,
                    log.args.id,
                ),
                "statementId": log.args.id,
                "statementText": log.args.statement,
                "forumAddress": forum_contract_address,
                "lastEngagement": added_block_timestamps[log.blockNumber],
            }
            for log in added_logs
        ]
        logger.debug(
            "[live] add_documents(%s) %s:\n%s",
            forum_contract_address,
            range_label,
            json.dumps(docs, indent=2),
        )
        _wait_task(
            index,
            index.add_documents(docs),
            f"live add_documents({forum_contract_address} {range_label})",
        )
        logger.info(
            "Indexed %d statement(s) from contract %s in %s",
            len(docs),
            forum_contract_address,
            range_label,
        )

    if engaged_logs:
        engagement_docs = await _engagement_docs(
            w3,
            engaged_logs,
            forum_contract_address,
        )
        logger.debug(
            "[live] update_documents(%s) %s:\n%s",
            forum_contract_address,
            range_label,
            json.dumps(engagement_docs, indent=2),
        )
        _wait_task(
            index,
            index.update_documents(engagement_docs),
            f"live update_documents({forum_contract_address} {range_label})",
        )
        logger.debug(
            "Updated engagement for %d statement(s) from contract %s in %s",
            len(engagement_docs),
            forum_contract_address,
            range_label,
        )


async def _index_missing_blocks(
    w3: AsyncWeb3,
    contracts: Sequence[tuple[str, Any]],
    index: Any,
    cursor: int,
    target_block: int,
    persist_cursor: Any | None = None,
) -> int:
    """Index all missing blocks from ``cursor`` through ``target_block``.

    Returns the next block that still needs indexing.
    """
    if cursor > target_block:
        logger.debug(
            "No missing blocks to index (cursor=%d, target=%d)",
            cursor,
            target_block,
        )
        return cursor

    total_blocks = target_block - cursor + 1
    logger.info(
        "Catch-up: indexing %d block(s) (%d → %d) in batches of %d",
        total_blocks,
        cursor,
        target_block,
        _INDEX_RANGE_BATCH_SIZE,
    )

    while cursor <= target_block:
        batch_end = min(cursor + _INDEX_RANGE_BATCH_SIZE - 1, target_block)
        logger.info(
            "Scanning blocks %d → %d (%d remaining after this batch)",
            cursor,
            batch_end,
            max(0, target_block - batch_end),
        )

        await asyncio.gather(
            *(
                _index_forum_block_range(
                    w3,
                    contract,
                    index,
                    forum_contract_address,
                    cursor,
                    batch_end,
                )
                for forum_contract_address, contract in contracts
            )
        )
        cursor = batch_end + 1
        if persist_cursor is not None:
            persist_cursor(cursor)

    logger.info("Catch-up complete; cursor advanced to block #%d", cursor)
    return cursor


async def _eviction_loop(
    index: Any,
    eviction_max_age_seconds: int,
) -> None:
    """Periodically delete documents whose ``lastEngagement`` is stale.

    Runs forever; safe to cancel.
    """
    while True:
        await asyncio.sleep(_EVICTION_INTERVAL_SECONDS)
        try:
            cutoff = int(time.time()) - eviction_max_age_seconds
            result = index.delete_documents(filter=f"lastEngagement < {cutoff}")
            logger.info(
                "Eviction sweep: submitted task %s (cutoff ts=%d)",
                result.task_uid,
                cutoff,
            )
        except Exception:
            logger.exception("Eviction sweep failed")


async def run_indexers(
    meili_client: meilisearch.Client,
    forum_contract_addresses: Sequence[str],
    ethereum_rpc_url: str,
    eviction_max_age_seconds: int = DEFAULT_EVICTION_MAX_AGE_SECONDS,
) -> None:
    """Poll chain logs over HTTP and index tracked events for multiple forums.

    Documents whose ``lastEngagement`` is older than
    *eviction_max_age_seconds* are periodically removed from the index.

    This coroutine runs indefinitely.  It is safe to cancel via
    ``task.cancel()``.
    """
    normalized_forum_contract_addresses = parse_forum_contract_addresses(
        forum_contract_addresses
    )
    if not normalized_forum_contract_addresses:
        raise ValueError("At least one forum contract address is required")

    forum_abi = _load_forum_abi()
    _ensure_index(meili_client)
    _ensure_indexer_state_index(meili_client)
    index = meili_client.index(STATEMENTS_INDEX)

    logger.info(
        "Starting polling indexer for %d contract(s) via %s "
        "(poll=%ss, max blocks/request=%d, startup lookback<=%ss, eviction TTL=%ds)",
        len(normalized_forum_contract_addresses),
        ethereum_rpc_url,
        _POLL_INTERVAL_SECONDS,
        _INDEX_RANGE_BATCH_SIZE,
        _MAX_STARTUP_LOOKBACK_SECONDS,
        eviction_max_age_seconds,
    )

    # Start the eviction background loop.
    eviction_task = asyncio.create_task(_eviction_loop(index, eviction_max_age_seconds))

    next_block_to_index: int | None = None

    try:
        while True:
            try:
                w3 = AsyncWeb3(AsyncHTTPProvider(ethereum_rpc_url))
                contracts = [
                    (
                        forum_contract_address,
                        w3.eth.contract(
                            address=forum_contract_address,
                            abi=forum_abi,
                        ),
                    )
                    for forum_contract_address in normalized_forum_contract_addresses
                ]
                chain_id = int(await w3.eth.chain_id)
                cursor_doc_id = _cursor_document_id(
                    chain_id,
                    normalized_forum_contract_addresses,
                )

                if next_block_to_index is None:
                    next_block_to_index = await _initial_index_cursor(
                        w3,
                        meili_client,
                        cursor_doc_id,
                    )
                else:
                    logger.info(
                        "Resuming in-memory index cursor at block #%d",
                        next_block_to_index,
                    )

                while True:
                    latest_block = await _latest_chain_block_number(w3)
                    if next_block_to_index <= latest_block:
                        next_block_to_index = await _index_missing_blocks(
                            w3,
                            contracts,
                            index,
                            next_block_to_index,
                            latest_block,
                            persist_cursor=lambda cursor: _persist_cursor(
                                meili_client,
                                cursor_doc_id,
                                cursor,
                            ),
                        )
                        continue

                    logger.info(
                        "Up to date at block #%d; sleeping %ds before next poll",
                        latest_block,
                        _POLL_INTERVAL_SECONDS,
                    )
                    await asyncio.sleep(_POLL_INTERVAL_SECONDS)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Indexer connection error, reconnecting in 5 seconds…")
                await asyncio.sleep(5)
    except asyncio.CancelledError:
        logger.info("Indexer cancelled, shutting down")
        eviction_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await eviction_task
        raise
