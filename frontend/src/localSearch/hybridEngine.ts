// Browser hybrid search engine: Orama BM25 full-text + MiniLM vector search.
//
// Mirrors the eval PoC (scripts/eval/hybrid/oramaEngine.ts) but adds embedding
// management: it keeps a per-statement embedding cache in memory, only embeds
// statements it hasn't seen, and reports newly-computed vectors so the caller
// can persist them to IndexedDB for reuse on the next visit.
//
// Used only inside the dedicated hybrid Web Worker.

import { create, insertMultiple, search } from "@orama/orama";

import { Embedder } from "./embedder";
import type {
  EmbeddingEntry,
  HybridProgress,
  IndexedStatement,
  SearchMode,
} from "./types";

// Blend of full-text vs vector rankings for similarity search.
const HYBRID_WEIGHTS = { text: 0.5, vector: 0.5 };
// Minimum cosine similarity for the vector side. Orama's 0.8 default is too
// strict for MiniLM, where related-but-not-identical pairs sit around 0.4–0.7.
const VECTOR_SIMILARITY = 0.3;

export interface IndexOutcome {
  size: number;
  /** Vectors computed during this call, to be persisted by the caller. */
  newEmbeddings: EmbeddingEntry[];
  model: string;
  dim: number;
}

export class HybridSearchEngine {
  private readonly embedder: Embedder;
  private embeddings = new Map<number, Float32Array>();
  private db: Awaited<ReturnType<typeof create>> | null = null;
  private dim = 0;
  private ids = new Set<number>();

  constructor(embedder: Embedder) {
    this.embedder = embedder;
  }

  get model(): string {
    return this.embedder.model;
  }

  private ensureDb(): Awaited<ReturnType<typeof create>> {
    if (!this.db) {
      const schema = {
        docId: "number",
        text: "string",
        embedding: `vector[${this.dim}]`,
      };
      this.db = create({ schema: schema as never });
      this.ids = new Set();
    }
    return this.db;
  }

  /**
   * Index `documents`. When `replace` is true the index is rebuilt from
   * scratch. `cachedEmbeddings` seed the in-memory cache so already-known
   * statements are not re-embedded. `onProgress` reports the one-time model
   * download and the embedding pass. Returns any vectors computed here.
   */
  async indexDocuments(
    documents: IndexedStatement[],
    replace: boolean,
    cachedEmbeddings: EmbeddingEntry[],
    onProgress?: (progress: HybridProgress) => void,
  ): Promise<IndexOutcome> {
    if (replace) {
      this.embeddings = new Map();
      this.db = null;
      this.dim = 0;
      this.ids = new Set();
    }
    for (const entry of cachedEmbeddings) {
      if (!this.embeddings.has(entry.id)) {
        this.embeddings.set(entry.id, entry.vector);
      }
    }

    // Embed statements we have no vector for.
    const missing = documents.filter((d) => !this.embeddings.has(d.id));
    const newEmbeddings: EmbeddingEntry[] = [];
    if (missing.length > 0) {
      console.log(
        `[hybrid] engine: ${missing.length} statements need embedding (of ${documents.length})`,
      );
      // Model download (first use only) → "download" phase.
      this.embedder.onDownloadProgress = (fraction) =>
        onProgress?.({ phase: "download", fraction });
      await this.embedder.load();
      this.embedder.onDownloadProgress = undefined;

      // Embedding pass → "index" phase.
      const vectors = await this.embedder.embed(
        missing.map((d) => d.text),
        32,
        (done, total) =>
          onProgress?.({
            phase: "index",
            fraction: total > 0 ? done / total : 1,
          }),
      );
      missing.forEach((doc, i) => {
        this.embeddings.set(doc.id, vectors[i]);
        newEmbeddings.push({ id: doc.id, vector: vectors[i] });
      });
    }

    if (this.dim === 0) {
      const any =
        this.embeddings.values().next().value ??
        (cachedEmbeddings[0]?.vector as Float32Array | undefined);
      this.dim = any ? any.length : 0;
    }
    if (this.dim === 0) {
      // Nothing to index (no docs, no vectors).
      return { size: 0, newEmbeddings, model: this.model, dim: 0 };
    }

    const db = this.ensureDb();
    const records = documents
      .filter((doc) => this.embeddings.has(doc.id) && !this.ids.has(doc.id))
      .map((doc) => ({
        docId: doc.id,
        text: doc.text,
        embedding: Array.from(this.embeddings.get(doc.id)!),
      }));
    if (records.length > 0) {
      await insertMultiple(db, records as never[], 500);
      for (const r of records) this.ids.add(r.docId);
    }

    return {
      size: this.ids.size,
      newEmbeddings,
      model: this.model,
      dim: this.dim,
    };
  }

  async search(
    query: string,
    mode: SearchMode,
    limit: number,
  ): Promise<number[]> {
    if (!this.db) return [];

    // Keyword mode → pure BM25. Similarity mode → hybrid (BM25 + vector).
    const params =
      mode === "keyword"
        ? { mode: "fulltext" as const, term: query, limit }
        : {
            mode: "hybrid" as const,
            term: query,
            vector: {
              value: Array.from(await this.embedder.embedOne(query)),
              property: "embedding",
            },
            similarity: VECTOR_SIMILARITY,
            hybridWeights: HYBRID_WEIGHTS,
            limit,
          };

    const result = await search(this.db, params as never);
    return result.hits.map(
      (hit) => (hit.document as unknown as { docId: number }).docId,
    );
  }

  size(): number {
    return this.ids.size;
  }
}
