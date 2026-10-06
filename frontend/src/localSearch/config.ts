// Configuration constants for the browser-local search engine.
// See docs/local-search-engine-design.md for rationale.

/** How far back (in seconds) to scan `StatementEngaged` events on a full sync. */
export const LOOKBACK_SECONDS = 86_400; // 1 day

/** Maximum number of documents held per forum index. */
export const DOC_CAP = 2_000;

/**
 * Block span per `eth_getLogs` request. Windows are aligned to multiples of this
 * value so that clients issue identical canonical ranges — maximizing relay/CDN
 * cache hits. Must stay at or below the relay's enforced maximum range.
 */
export const GETLOGS_WINDOW_BLOCKS = 1_000n;

/**
 * Number of blocks to stay behind the chain head when scanning logs, to avoid
 * churn from shallow reorgs on the dynamic tail window.
 */
export const CONFIRMATION_BLOCKS = 5n;

/** Page size for `getRankedStatementsPage` reads while building the index. */
export const RANKED_PAGE_SIZE = 100;

/** Maximum number of per-forum indexes kept alive in the worker (LRU). */
export const MAX_FORUM_INDEXES = 5;

/**
 * Embedding model for the hybrid (semantic) engine: 384-dim English MiniLM,
 * ~30 MB quantized. Defined here (a dependency-free module) so the main thread
 * can reference it without pulling in the Transformers.js runtime, which lives
 * only in the hybrid worker.
 */
export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
