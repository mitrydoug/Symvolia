// Local sentence embeddings for the hybrid-search PoC.
//
// Uses Transformers.js (@xenova/transformers) to run a small MiniLM model
// entirely on-device — the same class of model we could later ship to the
// browser via WASM/WebGPU. Embeddings are mean-pooled and L2-normalized so a
// dot product equals cosine similarity.
//
// Computing embeddings is the slow part, so results are cached to disk keyed by
// (dataset role, model, document ids). Re-runs of the eval are then instant.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { env, pipeline } from "@xenova/transformers";

export const DEFAULT_MODEL = "Xenova/all-MiniLM-L6-v2";

// Keep the downloaded model weights inside our gitignored cache dir.
const here = import.meta.dirname;
env.cacheDir = join(here, "..", "datasets", ".cache", "models");
env.allowLocalModels = true;

type Extractor = (
  texts: string[],
  options: { pooling: "mean"; normalize: boolean },
) => Promise<{ tolist(): number[][] }>;

const pipelines = new Map<string, Promise<Extractor>>();

function getExtractor(model: string): Promise<Extractor> {
  let p = pipelines.get(model);
  if (!p) {
    p = pipeline("feature-extraction", model) as unknown as Promise<Extractor>;
    pipelines.set(model, p);
  }
  return p;
}

async function embedTexts(
  texts: string[],
  model: string,
  batchSize: number,
  label: string,
): Promise<{ dim: number; vectors: Float32Array[] }> {
  const extractor = await getExtractor(model);
  const vectors: Float32Array[] = [];
  let dim = 0;
  const started = Date.now();
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const output = await extractor(batch, { pooling: "mean", normalize: true });
    for (const row of output.tolist()) {
      dim = row.length;
      vectors.push(Float32Array.from(row));
    }
    if (texts.length > batchSize) {
      const done = Math.min(i + batchSize, texts.length);
      process.stdout.write(
        `\r  embedding ${label}: ${done}/${texts.length} ` +
        `(${((Date.now() - started) / 1000).toFixed(1)}s)   `,
      );
    }
  }
  if (texts.length > batchSize) process.stdout.write("\n");
  return { dim, vectors };
}

interface CacheMeta {
  model: string;
  dim: number;
  count: number;
  ids: number[];
}

function idsMatch(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Embed `items` (in order), caching to disk under `cacheDir/emb/`. The cache is
 * invalidated automatically if the model or the exact id list changes.
 */
export async function embedWithCache(opts: {
  cacheKey: string;
  items: Array<{ id: number; text: string }>;
  model: string;
  cacheDir: string;
  batchSize?: number;
  label?: string;
}): Promise<{ dim: number; vectors: Float32Array[] }> {
  const { cacheKey, items, model, cacheDir } = opts;
  const batchSize = opts.batchSize ?? 64;
  const label = opts.label ?? cacheKey;
  const modelSlug = model.replace(/[^\w.-]+/g, "_");
  const base = join(cacheDir, "emb", `${cacheKey}.${modelSlug}`);
  const binPath = `${base}.bin`;
  const metaPath = `${base}.json`;
  const ids = items.map((it) => it.id);

  if (existsSync(binPath) && existsSync(metaPath)) {
    const meta = JSON.parse(readFileSync(metaPath, "utf8")) as CacheMeta;
    if (meta.model === model && meta.count === items.length && idsMatch(meta.ids, ids)) {
      const buf = readFileSync(binPath);
      const flat = new Float32Array(
        buf.buffer,
        buf.byteOffset,
        buf.byteLength / 4,
      );
      const vectors: Float32Array[] = [];
      for (let i = 0; i < meta.count; i++) {
        vectors.push(flat.slice(i * meta.dim, (i + 1) * meta.dim));
      }
      console.log(`  embeddings ${label}: cache hit (${meta.count} × ${meta.dim})`);
      return { dim: meta.dim, vectors };
    }
  }

  const { dim, vectors } = await embedTexts(
    items.map((it) => it.text),
    model,
    batchSize,
    label,
  );

  mkdirSync(dirname(binPath), { recursive: true });
  const flat = new Float32Array(vectors.length * dim);
  vectors.forEach((v, i) => flat.set(v, i * dim));
  writeFileSync(binPath, Buffer.from(flat.buffer, flat.byteOffset, flat.byteLength));
  const meta: CacheMeta = { model, dim, count: vectors.length, ids };
  writeFileSync(metaPath, JSON.stringify(meta) + "\n");
  return { dim, vectors };
}

/** Embed a single query string (used at search time). */
export async function embedQuery(
  text: string,
  model: string,
): Promise<Float32Array> {
  const { vectors } = await embedTexts([text], model, 1, "query");
  return vectors[0];
}
