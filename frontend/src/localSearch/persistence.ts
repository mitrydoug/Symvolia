// IndexedDB persistence for the browser-local search engine, backed by
// idb-keyval. We persist the raw document set plus the last-synced block per
// forum so a returning user hydrates instantly and only fetches the delta.
//
// Storing raw documents (rather than a serialized MiniSearch index) keeps the
// on-disk format engine-agnostic; re-indexing a few thousand short statements
// is cheap.

import { del, get, set } from "idb-keyval";
import type { EmbeddingEntry, IndexedStatement } from "./types";

export interface PersistedForumIndex {
  documents: IndexedStatement[];
  /** Last block scanned, as a decimal string (bigint is not JSON-safe). */
  lastSyncedBlock: string;
}

const storageKey = (forumKey: string): string =>
  `symvolia:local-search:${forumKey}`;

const embeddingsKey = (forumKey: string): string =>
  `symvolia:local-search-emb:${forumKey}`;

export async function loadForumIndex(
  forumKey: string,
): Promise<PersistedForumIndex | undefined> {
  try {
    return await get<PersistedForumIndex>(storageKey(forumKey));
  } catch {
    return undefined;
  }
}

export async function saveForumIndex(
  forumKey: string,
  data: PersistedForumIndex,
): Promise<void> {
  try {
    await set(storageKey(forumKey), data);
  } catch {
    // Best-effort cache; ignore quota/availability errors.
  }
}

export async function clearForumIndex(forumKey: string): Promise<void> {
  try {
    await del(storageKey(forumKey));
  } catch {
    // Ignore.
  }
}

// ---------------------------------------------------------------------------
// Embedding cache (hybrid engine)
// ---------------------------------------------------------------------------
//
// Vectors are packed into a single ArrayBuffer (ids.length × dim floats) rather
// than thousands of small typed arrays, keeping the IndexedDB record compact and
// cheap to structured-clone. The stored model tags the cache so it is discarded
// if the embedding model ever changes.

interface PersistedForumEmbeddings {
  model: string;
  dim: number;
  ids: number[];
  data: ArrayBuffer;
}

/** Load the cached embeddings for a forum, discarding a stale-model cache. */
export async function loadForumEmbeddings(
  forumKey: string,
  model: string,
): Promise<EmbeddingEntry[]> {
  try {
    const stored = await get<PersistedForumEmbeddings>(embeddingsKey(forumKey));
    if (!stored || stored.model !== model || stored.dim <= 0) return [];
    const floats = new Float32Array(stored.data);
    const { ids, dim } = stored;
    return ids.map((id, i) => ({
      id,
      vector: floats.slice(i * dim, (i + 1) * dim),
    }));
  } catch {
    return [];
  }
}

/** Persist the full embedding set for a forum. */
export async function saveForumEmbeddings(
  forumKey: string,
  model: string,
  entries: EmbeddingEntry[],
): Promise<void> {
  if (entries.length === 0) return;
  try {
    const dim = entries[0].vector.length;
    const packed = new Float32Array(entries.length * dim);
    const ids: number[] = [];
    entries.forEach((entry, i) => {
      packed.set(entry.vector, i * dim);
      ids.push(entry.id);
    });
    const record: PersistedForumEmbeddings = {
      model,
      dim,
      ids,
      data: packed.buffer,
    };
    await set(embeddingsKey(forumKey), record);
  } catch {
    // Best-effort cache; ignore quota/availability errors.
  }
}

export async function clearForumEmbeddings(forumKey: string): Promise<void> {
  try {
    await del(embeddingsKey(forumKey));
  } catch {
    // Ignore.
  }
}
