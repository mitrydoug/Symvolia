// Dedicated Web Worker for hybrid (semantic) search. Kept separate from the
// lexical searchWorker so that the Transformers.js runtime and the MiniLM model
// download only load when a user opts into semantic search — the default
// lexical path never touches this file.
//
// Owns up to `MAX_FORUM_INDEXES` per-forum Orama indexes (LRU-evicted) plus a
// single shared embedder. Embedding caching/persistence is handled by the main
// thread: cached vectors arrive on `index` messages and newly-computed vectors
// are returned in the response.

/// <reference lib="webworker" />

import { MAX_FORUM_INDEXES } from "./config";
import { Embedder } from "./embedder";
import { HybridSearchEngine } from "./hybridEngine";
import type { HybridIndexResult, HybridOutbound, HybridRequest } from "./types";

console.log("[hybrid] worker: module loaded");

// Surface any uncaught error / unhandled rejection inside the worker so it isn't
// swallowed (these would otherwise leave the main thread waiting forever).
self.addEventListener("error", (event) => {
  console.error(
    "[hybrid] worker: uncaught error",
    event.message,
    event.error,
    event.error instanceof Error ? event.error.stack : undefined,
  );
});
self.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason as unknown;
  console.error(
    "[hybrid] worker: unhandledrejection",
    reason,
    reason instanceof Error ? reason.stack : undefined,
  );
});

const embedder = new Embedder();
const engines = new Map<string, HybridSearchEngine>();
const lru: string[] = [];

function touch(forumKey: string): void {
  const existing = lru.indexOf(forumKey);
  if (existing !== -1) lru.splice(existing, 1);
  lru.push(forumKey);
}

function evictIfNeeded(): void {
  while (lru.length > MAX_FORUM_INDEXES) {
    const oldest = lru.shift();
    if (oldest !== undefined) engines.delete(oldest);
  }
}

function getEngine(
  forumKey: string,
  create: boolean,
): HybridSearchEngine | undefined {
  let engine = engines.get(forumKey);
  if (!engine && create) {
    engine = new HybridSearchEngine(embedder);
    engines.set(forumKey, engine);
  }
  if (engine) {
    touch(forumKey);
    evictIfNeeded();
  }
  return engine;
}

function respond(message: HybridOutbound): void {
  (self as unknown as Worker).postMessage(message);
}

self.onmessage = async (event: MessageEvent<HybridRequest>): Promise<void> => {
  const message = event.data;
  console.log(
    `[hybrid] worker: recv req#${message.requestId} ${message.type} forum=${message.forumKey}`,
  );
  try {
    switch (message.type) {
      case "index": {
        console.log(
          `[hybrid] worker: index ${message.documents.length} docs, replace=${message.replace}, cached=${message.cachedEmbeddings.length}`,
        );
        const engine = getEngine(message.forumKey, true)!;
        const outcome: HybridIndexResult = await engine.indexDocuments(
          message.documents,
          message.replace,
          message.cachedEmbeddings,
          (progress) =>
            respond({
              type: "progress",
              requestId: message.requestId,
              phase: progress.phase,
              fraction: progress.fraction,
            }),
        );
        console.log(
          `[hybrid] worker: index done size=${outcome.size} new=${outcome.newEmbeddings.length}`,
        );
        respond({ requestId: message.requestId, ok: true, result: outcome });
        break;
      }
      case "search": {
        const engine = getEngine(message.forumKey, false);
        const hits = engine
          ? await engine.search(message.query, message.mode, message.limit)
          : [];
        respond({ requestId: message.requestId, ok: true, result: hits });
        break;
      }
      case "clear": {
        engines.delete(message.forumKey);
        const idx = lru.indexOf(message.forumKey);
        if (idx !== -1) lru.splice(idx, 1);
        respond({ requestId: message.requestId, ok: true, result: null });
        break;
      }
    }
  } catch (error) {
    console.error(`[hybrid] worker: req#${message.requestId} threw`, error);
    respond({
      requestId: message.requestId,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
