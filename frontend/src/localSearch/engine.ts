// MiniSearch-backed local search engine.
//
// The `LocalSearchEngine` interface is intentionally narrow so the underlying
// engine can be swapped later (e.g. to Orama for hybrid/vector search) without
// touching call sites. Only this file depends on MiniSearch directly.

import MiniSearch, { SearchOptions } from "minisearch";
import { STOP_WORDS } from "./stopwords";
import type { IndexedStatement, SearchMode } from "./types";

// Keyword mode: user types loose keywords. OR-combine with BM25 ranking so docs
// matching more terms rank higher; prefix + light fuzzy for partial words/typos.
const KEYWORD_OPTIONS: SearchOptions = {
  combineWith: "OR",
  prefix: true,
  fuzzy: 0.2,
};

// Similarity mode: the query is a drafted statement. OR-combine (with BM25
// length normalization) surfaces partial matches without over-penalizing
// statements that miss some query keywords.
const SIMILARITY_OPTIONS: SearchOptions = {
  combineWith: "OR",
  fuzzy: 0.1,
};

/** A single search hit paired with its relevance score. */
export interface ScoredResult {
  id: number;
  score: number;
}

/**
 * Optional tuning knobs. Every field is optional and defaults to the
 * production values below, so `new MiniSearchEngine()` behaves identically to
 * before. This exists so the search evaluation harness can trial alternate
 * parameters through the exact same engine the app uses.
 */
export interface EngineConfig {
  /** Similarity-mode search options, shallow-merged over the defaults. */
  similarityOptions?: SearchOptions;
  /** Keyword-mode search options, shallow-merged over the defaults. */
  keywordOptions?: SearchOptions;
  /** Full replacement for the indexed/searched stop-word set. */
  stopWords?: ReadonlySet<string>;
  /** Minimum term length to keep when tokenizing (default 2). */
  minTermLength?: number;
}

export interface LocalSearchEngine {
  /** Replace the entire index with exactly these documents. */
  replaceAll(documents: IndexedStatement[]): void;
  /** Add or update documents, preserving the rest of the index. */
  upsert(documents: IndexedStatement[]): void;
  /** Remove documents by id. */
  remove(ids: number[]): void;
  /** Return matching statement ids, most relevant first, capped at `limit`. */
  search(query: string, mode: SearchMode, limit: number): number[];
  /** Number of documents currently indexed. */
  size(): number;
}

function createMiniSearch(
  stopWords: ReadonlySet<string>,
  minTermLength: number,
): MiniSearch<IndexedStatement> {
  return new MiniSearch<IndexedStatement>({
    idField: "id",
    fields: ["text"],
    storeFields: [],
    processTerm: (term) => {
      const lower = term.toLowerCase();
      if (lower.length < minTermLength) return null;
      if (stopWords.has(lower)) return null;
      return lower;
    },
  });
}

export class MiniSearchEngine implements LocalSearchEngine {
  private readonly similarityOptions: SearchOptions;
  private readonly keywordOptions: SearchOptions;
  private readonly stopWords: ReadonlySet<string>;
  private readonly minTermLength: number;
  private index: MiniSearch<IndexedStatement>;
  private ids = new Set<number>();

  constructor(config: EngineConfig = {}) {
    this.similarityOptions = {
      ...SIMILARITY_OPTIONS,
      ...config.similarityOptions,
    };
    this.keywordOptions = { ...KEYWORD_OPTIONS, ...config.keywordOptions };
    this.stopWords = config.stopWords ?? STOP_WORDS;
    this.minTermLength = config.minTermLength ?? 2;
    this.index = createMiniSearch(this.stopWords, this.minTermLength);
  }

  replaceAll(documents: IndexedStatement[]): void {
    this.index = createMiniSearch(this.stopWords, this.minTermLength);
    this.ids = new Set();
    this.upsert(documents);
  }

  upsert(documents: IndexedStatement[]): void {
    for (const doc of documents) {
      if (this.ids.has(doc.id)) {
        this.index.replace(doc);
      } else {
        this.index.add(doc);
        this.ids.add(doc.id);
      }
    }
  }

  remove(ids: number[]): void {
    for (const id of ids) {
      if (this.ids.has(id)) {
        this.index.discard(id);
        this.ids.delete(id);
      }
    }
  }

  search(query: string, mode: SearchMode, limit: number): number[] {
    return this.searchScored(query, mode, limit).map((result) => result.id);
  }

  /**
   * Like `search`, but also returns each hit's raw relevance score. Useful for
   * diagnostics/evaluation; `search` is the thin id-only wrapper the app uses.
   */
  searchScored(query: string, mode: SearchMode, limit: number): ScoredResult[] {
    const options =
      mode === "similarity" ? this.similarityOptions : this.keywordOptions;
    return this.index
      .search(query, options)
      .slice(0, limit)
      .map((result) => ({ id: Number(result.id), score: result.score }));
  }

  size(): number {
    return this.ids.size;
  }
}
