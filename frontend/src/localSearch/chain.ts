// Chain-reading helpers for the browser-local search engine. All functions use a
// viem PublicClient (from wagmi's `usePublicClient`) so they respect the app's
// configured transport, including the backend relay and any user-supplied RPC.

import type { PublicClient } from "viem";
import { parseAbiItem } from "viem";
import { FORUM_ABI } from "@/contracts";
import type { IndexedStatement } from "./types";
import { GETLOGS_WINDOW_BLOCKS, RANKED_PAGE_SIZE } from "./config";

type Address = `0x${string}`;

const STATEMENT_ENGAGED_EVENT = parseAbiItem(
  "event StatementEngaged(uint256 indexed statementId)",
);

// Shape of a `Forum.Statement` struct as returned by the contract reads.
interface RawStatement {
  id: bigint;
  text: string;
  createdTimestamp: bigint;
  support: bigint;
  rank: bigint;
  peakRank: bigint;
}

/** Read all currently-ranked statements, up to `cap`, as index documents. */
export async function fetchRankedStatements(
  client: PublicClient,
  forum: Address,
  cap: number,
): Promise<IndexedStatement[]> {
  const rankedCount = await client.readContract({
    address: forum,
    abi: FORUM_ABI,
    functionName: "rankedCount",
  });

  const total = Math.min(Number(rankedCount), cap);
  const documents: IndexedStatement[] = [];

  for (let start = 0; start < total; start += RANKED_PAGE_SIZE) {
    const limit = Math.min(RANKED_PAGE_SIZE, total - start);
    const page = (await client.readContract({
      address: forum,
      abi: FORUM_ABI,
      functionName: "getRankedStatementsPage",
      args: [BigInt(start), BigInt(limit)],
    })) as readonly RawStatement[];

    for (const statement of page) {
      documents.push({ id: Number(statement.id), text: statement.text });
    }
  }

  return documents;
}

/**
 * Collect statement ids that emitted a `StatementEngaged` event within
 * `[fromBlock, toBlock]`. Logs are queried in block-aligned windows of
 * `GETLOGS_WINDOW_BLOCKS` so requests are canonical and cache-friendly.
 */
export async function fetchEngagedStatementIds(
  client: PublicClient,
  forum: Address,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<number[]> {
  const ids = new Set<number>();
  if (toBlock < fromBlock) return [];

  const window = GETLOGS_WINDOW_BLOCKS;
  // Align the first window down to a multiple of `window` so historical ranges
  // are identical across clients (only the final tip window is partial).
  let windowStart = (fromBlock / window) * window;

  while (windowStart <= toBlock) {
    const windowEnd = windowStart + window - 1n;
    const end = windowEnd < toBlock ? windowEnd : toBlock;

    const logs = await client.getLogs({
      address: forum,
      event: STATEMENT_ENGAGED_EVENT,
      fromBlock: windowStart,
      toBlock: end,
    });

    for (const log of logs) {
      const statementId = log.args.statementId;
      if (statementId !== undefined) ids.add(Number(statementId));
    }

    windowStart += window;
  }

  return [...ids];
}

/**
 * Resolve statement ids to index documents via `getStatementsById`. Ids at or
 * beyond `statementCount` are dropped first to avoid a contract revert.
 */
export async function fetchStatementsByIds(
  client: PublicClient,
  forum: Address,
  ids: number[],
): Promise<IndexedStatement[]> {
  if (ids.length === 0) return [];

  const statementCount = await client.readContract({
    address: forum,
    abi: FORUM_ABI,
    functionName: "statementCount",
  });
  const count = Number(statementCount);

  const validIds = ids.filter((id) => id < count).map((id) => BigInt(id));
  if (validIds.length === 0) return [];

  const statements = (await client.readContract({
    address: forum,
    abi: FORUM_ABI,
    functionName: "getStatementsById",
    args: [validIds],
  })) as readonly RawStatement[];

  return statements.map((statement) => ({
    id: Number(statement.id),
    text: statement.text,
  }));
}
