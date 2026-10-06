# Browser-Local Search Engine — Design Notes

**Status:** Draft / pre-implementation discussion
**Scope:** Frontend (`frontend/`), with a small backend relay change (`backend/`)
**Related principle:** Constitution §I *Decentralization-First* — provide search that works without the backend service.

---

## 1. Motivation

Today, statement search runs entirely through the backend search service
(Meilisearch behind FastAPI: `GET /search` lexical, `GET /similar` semantic).
The frontend `useSearch` hook calls those endpoints and resolves the returned
statement IDs to full statements via the `getStatementsById` RPC read.

We want an **optional, browser-local search engine** that a user can select on
the Settings page as an alternative to the backend. Benefits:

- **Decentralization:** search continues to work if the backend is unavailable.
- **Privacy:** search queries never leave the browser.
- **Graceful degradation:** a natural fallback path when the backend is down.

The local engine is an *alternative*, not a replacement. Users choose per-browser.

---

## 2. Goals & Non-Goals

### Goals
- Two search modes, both running fully in the browser:
  - **Keyword search** — user types keywords (not a coherent sentence, not
    autocomplete); return matching statements.
  - **Similarity search** — during the create-statement flow, the user's drafted
    statement is the query; surface similar/related statements. Must reward
    **partial matches** and must **not over-penalize** statements missing some
    query keywords.
- Index a bounded working set sourced directly from chain reads.
- User opt-in via Settings, with clear communication of the coverage tradeoff.

### Non-Goals (v1)
- **Semantic / dense retrieval in-browser.** Lexical ranking only. (Quantized
  embedding models via `transformers.js` are technically possible but rejected
  for v1 on download-size / performance grounds. Revisit later if desired.)
- **Full-corpus coverage.** The local index deliberately holds only a subset
  (see §4). The backend remains the option for exhaustive search.
- **Strict parity** with backend ranking/tokenization. We reuse the stopword
  list for consistency but otherwise tune for local quality.

---

## 3. Search Library Choice

**Decision: start with [MiniSearch](https://github.com/lucaong/minisearch).**

Rationale:
- Tiny footprint; inverted index with BM25-style scoring.
- `combineWith: 'OR'` + per-term `boost` + `fuzzy`/`prefix` — a direct fit for
  the "partial match, don't over-penalize" similarity requirement.
- Incremental `add` / `remove` — supports live updates as new statements and
  engagement events arrive.
- Serializable index → cache in IndexedDB.

**Future migration to [Orama](https://github.com/oramasearch/orama):** kept open.
Orama offers BM25 full-text plus optional in-browser vector/hybrid search, which
would be the upgrade path if we ever want semantic locally.

> **Design rule:** hide the engine behind a narrow `LocalSearchEngine` interface
> from day one (`addBatch`, `remove`, `search(query, mode)`, `serialize`,
> `load`). This keeps the engine out of call sites and makes a MiniSearch→Orama
> swap a contained change (index config, serialization format, query-option
> mapping) rather than a cross-cutting refactor.

### Mode mapping
- **Keyword:** BM25 ranking; `fuzzy` for typo tolerance; moderate `OR` combine.
- **Similarity:** tokenize the drafted statement, query with `combineWith: 'OR'`
  and document-length normalization so subset matches still surface, ranked
  below fuller matches. Conceptually mirrors the backend's
  `build_similarity_query` (top content tokens, stopword removal).

---

## 4. What Gets Indexed (the hard part)

On load, the local engine assembles a bounded per-forum working set from two
chain sources:

1. **All currently ranked statements** — via `getRankedStatementsPage`
   (read-only RPC, paged). Already used by `RankedBrowse` in `Home.tsx`. Cheap.
2. **Statements from `StatementEngaged` events over the past `X` seconds** —
   requires `eth_getLogs`. `StatementEngaged` carries only `statementId`, so
   collected IDs are resolved to text via a `getStatementsById` batch call.
   The two sets are **deduplicated** before indexing.

### Lookback window
- `X` is a fixed constant (not a Settings value). Default target ≈ **86,400s
  (1 day)**, tunable in code.
- Convert to a block span with a simple formula: `blocks ≈ X / blockTime`
  (Base Sepolia ≈ 2s blocks → ~43,200 blocks/day). `eth_getBlockByNumber` (which
  *is* relay-allowlisted) can anchor "now" and estimate the start block.

### Document cap
- Cap the per-forum index at **2000 documents** (ranked ∪ recently-engaged,
  most-recent-first, truncated). Tunable. MiniSearch handles far more, but this
  keeps first-build time, memory, and multi-forum footprint comfortable.

### The `eth_getLogs` cost problem
`eth_getLogs` cost grows with **both**:
- the **block range scanned** (each block's bloom filter is checked — cost is
  ~linear in range, *even for sparse events*), and
- the **number of matching logs returned**.

This is why the backend indexer caps `INDEXER_MAX_BLOCKS_PER_REQUEST=600`: a
day's worth of blocks cannot be scanned in one call. A full-day `StatementEngaged`
scan therefore requires **many paged calls** (~72 at 600 blocks/call). This makes
"non-ranked but recently engaged" the most expensive part of indexing and the
main subject of the caching strategy below.

---

## 5. Caching & Windowing Strategy

To make the expensive log scan affordable across reloads and across users:

- **Fixed, block-aligned windows.** Quantize the getLogs range into canonical
  buckets of `N` blocks (aligned to multiples of `N`). Because every client
  requests identical ranges, the relay/CDN sees a **high cache-hit rate**.
- **Immutable history, dynamic tail.** Historical (finalized) windows don't
  change → cache aggressively / long-lived. Only the **current partial window**
  is dynamic; fetch it uncached with a small **confirmation buffer** (a few
  blocks behind head) to avoid shallow-reorg churn.
- **IndexedDB delta sync.** Persist the index plus the **last-synced block**. A
  returning user hydrates from IndexedDB and fetches only windows newer than
  their last sync. Net effect: the full-day scan happens roughly **once per
  user**, and relay caching amortizes even that across the user base.

### Backend relay change
- Add `eth_getLogs` to `RPC_RELAY_ALLOWED_METHODS` (currently excluded on
  base-sepolia).
- **Enforce block-aligned, fixed-size windows server-side.** The relay rejects
  any `eth_getLogs` whose `fromBlock` is not a multiple of
  `RPC_RELAY_GETLOGS_WINDOW_BLOCKS` (default `1000`, matching the frontend's
  `GETLOGS_WINDOW_BLOCKS`) or whose span exceeds one window. This forces every
  client onto the same canonical grid — maximizing upstream cache hits — and
  bounds each request against RPC abuse. The filter `address` (single or list)
  must be allowlisted, and named block tags (`latest`, `pending`, …) are
  rejected so a range can't silently span the whole chain.
- Consider relay-side response caching keyed on canonical (aligned) ranges so
  immutable windows are served from cache.

---

## 6. Performance & Lifecycle

- **Web Worker:** build and query the index off the main thread (important given
  dozens of getLogs round-trips on first build).
- **IndexedDB persistence:** store serialized index + last-synced block per
  forum; hydrate on load, then fetch deltas.
- **Multiple live indexes per forum:** keep a `Map<forumAddress, Index>` alive
  rather than tearing down on forum switch. Add simple **LRU eviction** (keep the
  most recently used ~3–5 forums) to bound memory.
- **Live updates:** refresh on the existing block-sync cadence
  (`VITE_BLOCK_POLLING_INTERVAL_SECONDS`) rather than a separate subscription, so
  local search stays consistent with how the rest of the app refreshes.

---

## 7. Tokenization

- **Reuse the backend stopword list** (from `backend/src/symvolia/search_query.py`)
  for consistent behavior when toggling engines.
- Otherwise tune the analyzer (stemming, prefix, fuzzy) purely for the best
  **browser-local** quality. Strict backend parity is explicitly *not* a
  priority.

---

## 8. UX & Settings

- **Settings toggle:** choose "Backend search" vs. "Browser-local search",
  persisted in `localStorage` (per browser).
- **Communicate the coverage gap:** a tooltip / short prose blurb on the Settings
  page explaining that local search covers only *ranked + recently-engaged*
  statements (so older/low-support statements may not appear), plus the
  motivation (works offline / privacy / decentralization).
- **Similarity caveat:** note that local similarity is *lexical*, whereas the
  backend `/similar` is *semantic*.

### Integration seam
`useSearch` already returns just `SearchHit[]` (statement IDs) and lets
components resolve text via RPC. The local engine implements the **same
`SearchHit[]` contract**, so the Settings toggle swaps the hit-provider with
minimal disruption to `Home.tsx`, `SimilarStatements.tsx`, and
`CreateStatementModal.tsx`.

---

## 9. Key Risks & Open Questions

- **Coverage gap is the #1 UX risk.** Local index ≠ full corpus. Mitigated via
  clear Settings messaging. **Decision: no auto-fallback** — when local search is
  selected, zero-result queries stay local (honest to the decentralization goal).
- **First-load cost** for the recently-engaged scan, even with caching. Tune `X`,
  `N` (window size), and the doc cap together.
- **Reorg handling** on the dynamic tail window (confirmation buffer depth).
- **Relay caching** implementation details (where: relay app cache vs. CDN;
  eviction; key canonicalization).
- **LRU size** for multi-forum indexes vs. memory budget.

---

## 10. Decisions Locked So Far

| Topic               | Decision                                                                            |
| ------------------- | ----------------------------------------------------------------------------------- |
| Library             | MiniSearch, behind a `LocalSearchEngine` abstraction                                |
| Semantic in-browser | Out of scope for v1                                                                 |
| Lookback `X`        | Fixed constant `86400`s (1 day), `blocks ≈ X / blockTime`, not user-configurable    |
| Auto-fallback       | None — local search stays local even on zero results                                |
| Doc cap             | 2000 per forum (tunable)                                                            |
| Forum handling      | Keep multiple indexes alive (`Map` + LRU), no teardown on switch                    |
| Dedup               | Ranked ∪ recently-engaged, deduplicated                                             |
| Persistence         | IndexedDB (serialized index + last-synced block)                                    |
| Threading           | Web Worker                                                                          |
| Live updates        | Tied to `VITE_BLOCK_POLLING_INTERVAL_SECONDS`                                       |
| Stopwords           | Reuse backend list; otherwise tune for local quality                                |
| getLogs             | Enable on relay with strict block-range cap; fixed aligned windows for cacheability |
| Settings UX         | Toggle + tooltip explaining coverage gap and motivation                             |
