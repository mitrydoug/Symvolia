"""Symvolia CLI entry-point for the standalone indexer.

Run with:
    python -m symvolia.main \
        --forum-contract-address 0x... \
        --forum-contract-address 0x... \
        --ethereum-rpc-url https://... \
        --meili-url http://... \
        --meili-api-key ...
"""

import argparse
import asyncio

import meilisearch

from symvolia.indexer import (
    DEFAULT_EVICTION_MAX_AGE_SECONDS,
    parse_forum_contract_addresses,
    run_indexers,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Symvolia Indexer")
    parser.add_argument(
        "--forum-contract-address",
        type=str,
        action="append",
        required=True,
        help=(
            "Address of a Forum contract. Repeat the flag or pass a comma-separated "
            "list to index multiple forums."
        ),
    )
    parser.add_argument(
        "--ethereum-rpc-url",
        type=str,
        required=True,
        help="HTTP RPC URL of the Ethereum node",
    )
    parser.add_argument(
        "--meili-url",
        type=str,
        required=True,
        help="URL of the Meilisearch instance",
    )
    parser.add_argument(
        "--meili-api-key",
        type=str,
        default="",
        help="Meilisearch API key (optional for local dev)",
    )
    parser.add_argument(
        "--eviction-max-age-seconds",
        type=int,
        default=DEFAULT_EVICTION_MAX_AGE_SECONDS,
        help=(
            "Maximum age (in seconds) for indexed documents without recent "
            "engagement.  Documents older than this are periodically evicted. "
            f"Default: {DEFAULT_EVICTION_MAX_AGE_SECONDS} (7 days)."
        ),
    )
    return parser.parse_args()


async def main() -> None:
    args = parse_args()
    forum_contract_addresses = parse_forum_contract_addresses(
        args.forum_contract_address
    )
    meili_client = meilisearch.Client(args.meili_url, args.meili_api_key)
    await run_indexers(
        meili_client=meili_client,
        forum_contract_addresses=forum_contract_addresses,
        ethereum_rpc_url=args.ethereum_rpc_url,
        eviction_max_age_seconds=args.eviction_max_age_seconds,
    )


if __name__ == "__main__":
    asyncio.run(main())
