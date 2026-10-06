// Orama-backed hybrid search engine for the PoC.
//
// Mirrors MiniSearchEngine's `searchScored` contract (returns {id, score}[]) but
// async, since embeddings and Orama's search are promise-based. Kept out of
// src/ so the production bundle and the live MiniSearch path are untouched — if
// hybrid wins, this lifts into src/localSearch/ later.
//
// "Hybrid" = Orama runs BM25 full-text search and vector (cosine) search over a
// precomputed embedding per document, then blends the two rankings by
// `hybridWeights`. mode can also be 'fulltext' or 'vector' to isolate a side.

import { create, insertMultiple, search } from "@orama/orama";

import type { ScoredResult } from "../../../src/localSearch/engine";

export type OramaMode = "hybrid" | "vector" | "fulltext";

export interface OramaConfig {
  dim: number;
  mode?: OramaMode;
  // Blend of full-text vs vector rankings (hybrid mode only). Default 0.5/0.5.
  hybridWeights?: { text: number; vector: number };
  // Minimum cosine similarity for the vector side. Orama defaults to 0.8, which
  // is aggressive for MiniLM; we default lower so vector recall is meaningful.
  similarity?: number;
}

// A minimal async engine contract so the runner can treat MiniSearch (wrapped)
// and Orama uniformly.
export interface AsyncSearchEngine {
  indexAll(
    docs: Array<{ id: number; text: string }>,
    vectors?: Float32Array[],
  ): Promise<void>;
  searchScored(
    query: string,
    limit: number,
    vector?: Float32Array,
  ): Promise<ScoredResult[]>;
}

interface IndexedDoc {
  docId: number;
  text: string;
  embedding: number[];
}

export class OramaHybridEngine implements AsyncSearchEngine {
  private readonly dim: number;
  private readonly mode: OramaMode;
  private readonly hybridWeights: { text: number; vector: number };
  private readonly similarity: number;
  // Orama's schema type is driven by a `vector[N]` string literal we can only
  // build at runtime, so the db is held loosely and results are narrowed below.
  private db: Awaited<ReturnType<typeof create>> | null = null;

  constructor(config: OramaConfig) {
    this.dim = config.dim;
    this.mode = config.mode ?? "hybrid";
    this.hybridWeights = config.hybridWeights ?? { text: 0.5, vector: 0.5 };
    this.similarity = config.similarity ?? 0.3;
  }

  async indexAll(
    docs: Array<{ id: number; text: string }>,
    vectors?: Float32Array[],
  ): Promise<void> {
    if (!vectors || vectors.length !== docs.length) {
      throw new Error("OramaHybridEngine.indexAll requires one vector per doc");
    }
    const schema = {
      docId: "number",
      text: "string",
      embedding: `vector[${this.dim}]`,
    };
    this.db = create({ schema: schema as never });

    const records: IndexedDoc[] = docs.map((doc, i) => ({
      docId: doc.id,
      text: doc.text,
      embedding: Array.from(vectors[i]),
    }));
    await insertMultiple(this.db, records as never[], 500);
  }

  async searchScored(
    query: string,
    limit: number,
    vector?: Float32Array,
  ): Promise<ScoredResult[]> {
    if (!this.db) throw new Error("OramaHybridEngine: index before searching");
    if (this.mode !== "fulltext" && !vector) {
      throw new Error(`OramaHybridEngine: ${this.mode} mode needs a query vector`);
    }

    const params =
      this.mode === "fulltext"
        ? { mode: "fulltext" as const, term: query, limit }
        : this.mode === "vector"
          ? {
            mode: "vector" as const,
            term: query,
            vector: { value: Array.from(vector!), property: "embedding" },
            similarity: this.similarity,
            limit,
          }
          : {
            mode: "hybrid" as const,
            term: query,
            vector: { value: Array.from(vector!), property: "embedding" },
            similarity: this.similarity,
            hybridWeights: this.hybridWeights,
            limit,
          };

    const result = await search(this.db, params as never);
    return result.hits.map((hit) => ({
      id: (hit.document as { docId: number }).docId,
      score: hit.score,
    }));
  }
}
