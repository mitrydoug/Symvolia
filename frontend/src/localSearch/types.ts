// Shared types for the browser-local search engine, including the Web Worker
// message protocol used between the main thread and the search worker.

/** Which search behavior to apply. */
export type SearchMode = "keyword" | "similarity";

/** A single statement document as held in the local index. */
export interface IndexedStatement {
  id: number;
  text: string;
}

// ---------------------------------------------------------------------------
// Worker message protocol
// ---------------------------------------------------------------------------

export type WorkerRequestBody =
  | {
      type: "index";
      forumKey: string;
      documents: IndexedStatement[];
      /** When true, replace the forum index with exactly these documents. */
      replace: boolean;
    }
  | {
      type: "search";
      forumKey: string;
      query: string;
      mode: SearchMode;
      limit: number;
    }
  | {
      type: "clear";
      forumKey: string;
    };

export type WorkerRequest = WorkerRequestBody & { requestId: number };

export type WorkerResponse =
  | { requestId: number; ok: true; result: unknown }
  | { requestId: number; ok: false; error: string };

// ---------------------------------------------------------------------------
// Hybrid (semantic) engine
// ---------------------------------------------------------------------------

/** Which browser-local engine backs a forum index. */
export type LocalEngineKind = "lexical" | "hybrid";

/** A statement id paired with its embedding vector. */
export interface EmbeddingEntry {
  id: number;
  vector: Float32Array;
}

// Hybrid worker protocol. Mirrors the lexical worker but carries embeddings in
// both directions: cached vectors are sent in so known statements aren't
// re-embedded, and freshly-computed vectors are returned for persistence.
export type HybridRequestBody =
  | {
      type: "index";
      forumKey: string;
      documents: IndexedStatement[];
      replace: boolean;
      cachedEmbeddings: EmbeddingEntry[];
    }
  | {
      type: "search";
      forumKey: string;
      query: string;
      mode: SearchMode;
      limit: number;
    }
  | {
      type: "clear";
      forumKey: string;
    };

export type HybridRequest = HybridRequestBody & { requestId: number };

/** Result of a hybrid `index` request. */
export interface HybridIndexResult {
  size: number;
  newEmbeddings: EmbeddingEntry[];
  model: string;
  dim: number;
}

/** Which phase of a first-time hybrid build is currently running. */
export type HybridPhase = "download" | "index";

/** Progress of an in-flight hybrid `index` request. */
export interface HybridProgress {
  phase: HybridPhase;
  /** Completion fraction in [0, 1]. */
  fraction: number;
}

/**
 * Out-of-band progress update for an in-flight hybrid `index` request. Tagged
 * with the originating `requestId` so the client can route it to that call's
 * progress handler.
 */
export interface HybridProgressMessage {
  type: "progress";
  requestId: number;
  phase: HybridPhase;
  fraction: number;
}

/** Anything the hybrid worker posts back to the main thread. */
export type HybridOutbound = WorkerResponse | HybridProgressMessage;
