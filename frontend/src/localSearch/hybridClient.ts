// Typed, promise-based client for the hybrid search Web Worker.
//
// This module deliberately imports only types plus the worker URL, so the heavy
// Transformers.js/Orama code stays inside the worker bundle and is fetched only
// when a `HybridSearchClient` is actually constructed (i.e. the user selected
// semantic search).

import type {
  HybridIndexResult,
  HybridOutbound,
  HybridProgress,
  HybridRequestBody,
  HybridRequest,
  EmbeddingEntry,
  IndexedStatement,
  SearchMode,
} from "./types";

interface Pending {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  onProgress?: (progress: HybridProgress) => void;
}

export class HybridSearchClient {
  private worker: Worker;
  private nextRequestId = 1;
  private pending = new Map<number, Pending>();

  constructor() {
    console.log("[hybrid] client: creating worker");
    this.worker = new Worker(new URL("./hybridWorker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = (event: MessageEvent<HybridOutbound>) => {
      const message = event.data;
      const entry = this.pending.get(message.requestId);
      if (!entry) return;
      if (!("ok" in message)) {
        // Out-of-band progress update for this request.
        console.log(
          `[hybrid] client: progress req#${message.requestId} ${message.phase} ${(message.fraction * 100).toFixed(1)}%`,
        );
        entry.onProgress?.({
          phase: message.phase,
          fraction: message.fraction,
        });
        return;
      }
      this.pending.delete(message.requestId);
      if (message.ok) {
        entry.resolve(message.result);
      } else {
        console.error(
          `[hybrid] client: req#${message.requestId} failed:`,
          message.error,
        );
        entry.reject(new Error(message.error));
      }
    };
    // A module-load or uncaught runtime error in the worker surfaces here (not
    // via onmessage). Without this, a failed worker would leave every pending
    // request unsettled — a silent hang. Reject everything so the UI recovers.
    this.worker.onerror = (event) => {
      const detail =
        event.message ||
        `worker error at ${event.filename}:${event.lineno}:${event.colno}`;
      console.error("[hybrid] client: worker.onerror:", detail, event.error);
      this.failAll(new Error(`Hybrid worker error: ${detail}`));
    };
    this.worker.onmessageerror = (event) => {
      console.error("[hybrid] client: worker.onmessageerror:", event);
      this.failAll(new Error("Hybrid worker message error (deserialization)"));
    };
  }

  private failAll(error: Error): void {
    for (const [, entry] of this.pending) {
      entry.reject(error);
    }
    this.pending.clear();
  }

  private send<T>(
    body: HybridRequestBody,
    onProgress?: (progress: HybridProgress) => void,
  ): Promise<T> {
    const requestId = this.nextRequestId++;
    const request: HybridRequest = { ...body, requestId };
    console.log(`[hybrid] client: send req#${requestId} ${body.type}`);
    return new Promise<T>((resolve, reject) => {
      this.pending.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        onProgress,
      });
      this.worker.postMessage(request);
    });
  }

  /** Index (or replace) documents, seeding the given cached embeddings. */
  index(
    forumKey: string,
    documents: IndexedStatement[],
    replace: boolean,
    cachedEmbeddings: EmbeddingEntry[],
    onProgress?: (progress: HybridProgress) => void,
  ): Promise<HybridIndexResult> {
    return this.send<HybridIndexResult>(
      {
        type: "index",
        forumKey,
        documents,
        replace,
        cachedEmbeddings,
      },
      onProgress,
    );
  }

  /** Run a search; resolves to matching statement ids (most relevant first). */
  search(
    forumKey: string,
    query: string,
    mode: SearchMode,
    limit: number,
  ): Promise<number[]> {
    return this.send<number[]>({
      type: "search",
      forumKey,
      query,
      mode,
      limit,
    });
  }

  /** Drop a forum index from the worker. */
  clear(forumKey: string): Promise<null> {
    return this.send<null>({ type: "clear", forumKey });
  }

  terminate(): void {
    this.worker.terminate();
    this.pending.clear();
  }
}
