"""Combined entry-point: search API + indexer in a single process.

Ideal for local development and low-traffic self-hosted deployments.

Run with:
    uvicorn symvolia.combined:app --host 0.0.0.0 --port 8000

Required env vars:
    MEILI_URL            — Meilisearch URL (required)
    MEILI_API_KEY        — Meilisearch API key (required)
    FORUM_CONTRACT_ADDRESSES — Comma-separated forum contract addresses
    INDEXER_RPC_URL      — HTTP RPC URL used by the indexer (required)
    RELAY_RPC_URL        — HTTP RPC URL used by the RPC relay for frontend
                           read traffic. Required for the relay to forward
                           requests; relay returns errors when not set.

Optional env vars:
    INDEXER_ENABLED — When "false", the Meilisearch indexer does not start
                      (the search index stays empty). The search API and RPC
                      relay remain available. Default: true.
    EVICTION_MAX_AGE_SECONDS — Maximum age (in seconds) for indexed
                               documents without recent engagement.
                               Documents older than this are periodically
                               evicted.  Default: 604800 (7 days).
    INDEXER_POLL_INTERVAL_SECONDS — Poll interval for chain log queries.
                                    Default: 60.
    INDEXER_MAX_BLOCKS_PER_REQUEST — Maximum block span per get_logs call.
                                     Default: 600.
    INDEXER_MAX_STARTUP_LOOKBACK_SECONDS — Startup catch-up cap.
                                           Default: 14400 (4h).
    RPC_RELAY_ALLOWED_METHODS — Comma-separated JSON-RPC methods allowed on
                                POST /rpc. Defaults to frontend-safe reads.
    RPC_RELAY_ALLOWED_CONTRACTS — Comma-separated contract addresses allowed
                                  for eth_call/eth_estimateGas.
                                  Defaults to FORUM_CONTRACT_ADDRESSES.
    RPC_RELAY_UPSTREAM_TIMEOUT_SECONDS — Upstream RPC timeout in seconds.
                                         Default: 15.
    MEILI_SEMANTIC_SEARCH_ENABLED — Configure Meilisearch local embeddings and
                                    enable /similar. Default: false.
    MEILI_SEMANTIC_EMBEDDER_MODEL — Hugging Face model used by Meilisearch when
                                    semantic search is enabled.
    MEILI_TASK_TIMEOUT_MS — Max time to wait for Meilisearch setup/indexing
                            tasks. Default: 300000.
    MEILI_CLIENT_TIMEOUT_SECONDS — Per-request Meilisearch HTTP timeout so the
                            service fails fast instead of hanging when
                            Meilisearch is unreachable. Default: 5.
"""

import asyncio
import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import meilisearch
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from symvolia.gas_sponsorship.api import create_api as create_gas_sponsorship_api
from symvolia.indexer import (
    DEFAULT_EVICTION_MAX_AGE_SECONDS,
    ensure_search_index,
    parse_forum_contract_addresses,
    run_indexers,
)
from symvolia.rpc_relay.api import create_api as create_rpc_relay_api
from symvolia.search_service.api import create_api

logging.basicConfig(
    level="INFO",
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
# Allow fine-grained control over symvolia package logging without enabling
# DEBUG output from third-party libraries (web3, websockets, urllib3, etc.).
# Set LOG_LEVEL=DEBUG to see detailed symvolia-internal logs only.
_symvolia_log_level = os.getenv("LOG_LEVEL", "INFO").upper()
logging.getLogger("symvolia").setLevel(_symvolia_log_level)
logger = logging.getLogger(__name__)


def require_env(name: str) -> str:
    """Return a required env var, failing fast if it is missing."""
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} must be set.")
    return value


def env_flag(name: str, default: bool) -> bool:
    """Return a boolean env var, treating unset/empty as the given default."""
    value = os.environ.get(name)
    if value is None or not value.strip():
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


MEILI_URL = require_env("MEILI_URL")
MEILI_API_KEY = require_env("MEILI_API_KEY")
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "")
FORUM_CONTRACT_ADDRESSES = os.environ.get("FORUM_CONTRACT_ADDRESSES", "")
INDEXER_RPC_URL = os.environ.get("INDEXER_RPC_URL", "")
INDEXER_ENABLED = env_flag("INDEXER_ENABLED", default=True)
EVICTION_MAX_AGE_SECONDS = int(
    os.environ.get("EVICTION_MAX_AGE_SECONDS", str(DEFAULT_EVICTION_MAX_AGE_SECONDS))
)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Start the indexer as a background task while the API is running."""
    if not INDEXER_ENABLED:
        logger.warning(
            "INDEXER_ENABLED is false — indexer will NOT start.  Search API and "
            "RPC relay are still available, but the search index stays empty."
        )
        yield
        return

    forum_contract_addresses = parse_forum_contract_addresses(FORUM_CONTRACT_ADDRESSES)
    if not forum_contract_addresses or not INDEXER_RPC_URL:
        logger.warning(
            "FORUM_CONTRACT_ADDRESSES or INDEXER_RPC_URL not set — "
            "indexer will NOT start.  Search API is still available."
        )
        yield
        return

    ensure_search_index(app.state.meili_client)

    task = asyncio.create_task(
        run_indexers(
            meili_client=app.state.meili_client,
            forum_contract_addresses=forum_contract_addresses,
            ethereum_rpc_url=INDEXER_RPC_URL,
            eviction_max_age_seconds=EVICTION_MAX_AGE_SECONDS,
        )
    )
    logger.info("Indexer background task started")
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    logger.info("Indexer background task stopped")


app = FastAPI(title="Symvolia Search (combined)", lifespan=lifespan)

if CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS.split(","),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.state.meili_client = meilisearch.Client(
    MEILI_URL, MEILI_API_KEY, timeout=int(os.getenv("MEILI_CLIENT_TIMEOUT_SECONDS", "5"))
)
create_api(app)
create_rpc_relay_api(app)
create_gas_sponsorship_api(app)
