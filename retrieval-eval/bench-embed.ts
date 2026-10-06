// Throwaway micro-benchmark: time embedding N short statements (cold + warm).
// Not part of the app; used once to answer the cold-start indexing question.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { env, pipeline } from "@xenova/transformers";

const here = import.meta.dirname;
env.cacheDir = join(here, "datasets", ".cache", "models");

const N = Number(process.argv[2] ?? 2000);
const batch = Number(process.argv[3] ?? 32);

// Real short texts: first N Quora corpus questions (~1 sentence each).
const corpusPath = join(here, "datasets", ".cache", "quora", "corpus.jsonl");
const lines = readFileSync(corpusPath, "utf8").split("\n").filter(Boolean).slice(0, N);
const texts = lines.map((l) => JSON.parse(l).text as string);
const avgChars = Math.round(texts.reduce((s, t) => s + t.length, 0) / texts.length);
console.log(`N=${texts.length} short statements, avg ${avgChars} chars, batch=${batch}`);

const t0 = Date.now();
const extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
console.log(`model load: ${((Date.now() - t0) / 1000).toFixed(2)}s`);

async function run(label) {
  const start = Date.now();
  for (let i = 0; i < texts.length; i += batch) {
    await extractor(texts.slice(i, i + batch), { pooling: "mean", normalize: true });
  }
  const secs = (Date.now() - start) / 1000;
  console.log(
    `${label}: ${secs.toFixed(2)}s total · ${((secs / texts.length) * 1000).toFixed(2)} ms/statement · ${Math.round(texts.length / secs)} statements/s`,
  );
}

await run("embed (cold JIT)");
await run("embed (warm)");
