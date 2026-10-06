// Web Worker that owns the per-forum MiniSearch indexes and runs all indexing
// and querying off the main thread. It holds up to `MAX_FORUM_INDEXES` forum
// indexes alive at once, evicting the least-recently-used forum when exceeded.
//
// The worker is purely CPU/text-bound: it never touches the network or
// IndexedDB. The main-thread provider owns chain fetching and persistence and
// feeds documents in via `index` messages.

/// <reference lib="webworker" />

import { MAX_FORUM_INDEXES } from "./config";
import { MiniSearchEngine, type LocalSearchEngine } from "./engine";
import type { WorkerRequest, WorkerResponse } from "./types";

const engines = new Map<string, LocalSearchEngine>();
// Least-recently-used ordering: front = oldest, back = most recent.
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
): LocalSearchEngine | undefined {
  let engine = engines.get(forumKey);
  if (!engine && create) {
    engine = new MiniSearchEngine();
    engines.set(forumKey, engine);
  }
  if (engine) {
    touch(forumKey);
    evictIfNeeded();
  }
  return engine;
}

function respond(message: WorkerResponse): void {
  (self as unknown as Worker).postMessage(message);
}

self.onmessage = (event: MessageEvent<WorkerRequest>): void => {
  const message = event.data;
  try {
    switch (message.type) {
      case "index": {
        const engine = getEngine(message.forumKey, true)!;
        if (message.replace) {
          engine.replaceAll(message.documents);
        } else {
          engine.upsert(message.documents);
        }
        respond({
          requestId: message.requestId,
          ok: true,
          result: engine.size(),
        });
        break;
      }
      case "search": {
        const engine = getEngine(message.forumKey, false);
        const hits = engine
          ? engine.search(message.query, message.mode, message.limit)
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
    respond({
      requestId: message.requestId,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
