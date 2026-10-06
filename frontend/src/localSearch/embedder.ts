// On-device sentence embeddings for hybrid search, via Transformers.js.
//
// Runs a small MiniLM model (ONNX/WASM) entirely in the browser. This module is
// only ever imported from the dedicated hybrid Web Worker, so the ~1 MB
// Transformers.js runtime (and the model download it triggers) is fetched only
// when a user opts into semantic search — never for the default lexical engine.
//
// Embeddings are mean-pooled and L2-normalized, so a dot product equals cosine
// similarity (which is what Orama's vector search expects).

import { env, pipeline } from "@xenova/transformers";

import { EMBEDDING_MODEL } from "./config";

export { EMBEDDING_MODEL };

// Always fetch weights from the hub and cache them in the browser Cache Storage
// (Transformers.js default). We never bundle model files.
env.allowLocalModels = false;

type FeatureExtractor = (
  texts: string[],
  options: { pooling: "mean"; normalize: boolean },
) => Promise<{ dims: number[]; data: Float32Array }>;

// Shape of the events Transformers.js passes to `progress_callback`.
interface ProgressEvent {
  status: string;
  file?: string;
  loaded?: number;
  total?: number;
}

export class Embedder {
  readonly model: string;
  private extractor: Promise<FeatureExtractor> | null = null;
  // Per-file byte counts, so we can report one smooth fraction across the whole
  // multi-file model download.
  private downloadBytes = new Map<string, { loaded: number; total: number }>();

  /** Called with a [0, 1] fraction as model files download (first load only). */
  onDownloadProgress?: (fraction: number) => void;

  constructor(model: string = EMBEDDING_MODEL) {
    this.model = model;
  }

  private handleDownload(event: ProgressEvent): void {
    if (event.status && event.status !== "progress") {
      console.log(
        `[hybrid] embedder: ${event.status}${event.file ? ` ${event.file}` : ""}`,
      );
    }
    if (
      event.status !== "progress" ||
      event.file === undefined ||
      typeof event.loaded !== "number" ||
      typeof event.total !== "number"
    ) {
      return;
    }
    this.downloadBytes.set(event.file, {
      loaded: event.loaded,
      total: event.total,
    });
    let loaded = 0;
    let total = 0;
    for (const entry of this.downloadBytes.values()) {
      loaded += entry.loaded;
      total += entry.total;
    }
    if (total > 0) this.onDownloadProgress?.(loaded / total);
  }

  private getExtractor(): Promise<FeatureExtractor> {
    if (!this.extractor) {
      console.log(`[hybrid] embedder: loading pipeline "${this.model}"`);
      this.extractor = pipeline("feature-extraction", this.model, {
        progress_callback: (event: ProgressEvent) => this.handleDownload(event),
      }) as unknown as Promise<FeatureExtractor>;
      this.extractor
        .then(() => console.log("[hybrid] embedder: pipeline ready"))
        .catch((error: unknown) =>
          console.error("[hybrid] embedder: pipeline failed", error),
        );
    }
    return this.extractor;
  }

  /** Warm the model (download + init) without embedding anything. */
  async load(): Promise<void> {
    await this.getExtractor();
  }

  /**
   * Embed `texts` in batches. Returns one Float32Array (unit vector) per input,
   * in order. `onProgress(done, total)` is called after each batch.
   */
  async embed(
    texts: string[],
    batchSize = 32,
    onProgress?: (done: number, total: number) => void,
  ): Promise<Float32Array[]> {
    const extractor = await this.getExtractor();
    const out: Float32Array[] = [];
    console.log(`[hybrid] embedder: embedding ${texts.length} texts…`);
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const tensor = await extractor(batch, {
        pooling: "mean",
        normalize: true,
      });
      const dim = tensor.dims[tensor.dims.length - 1];
      for (let r = 0; r < batch.length; r++) {
        out.push(tensor.data.slice(r * dim, (r + 1) * dim));
      }
      onProgress?.(Math.min(i + batchSize, texts.length), texts.length);
    }
    return out;
  }

  /** Embed a single string (used at query time). */
  async embedOne(text: string): Promise<Float32Array> {
    const [vector] = await this.embed([text], 1);
    return vector;
  }
}
