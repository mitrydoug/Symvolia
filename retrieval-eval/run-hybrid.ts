// Hybrid-search PoC evaluator.
//
// Runs the *same* dataset + metrics as run.ts through two engines side by side:
//   - MiniSearch (the production lexical engine) as the baseline
//   - Orama in hybrid / vector / fulltext mode over local MiniLM embeddings
// and prints a comparison plus a reports/hybrid/<dataset>.{json,md} artifact.
//
// This does NOT touch the frontend or the live search path — it exists purely
// to measure whether a hybrid approach is worth pursuing.
//
// Usage:
//   tsx scripts/eval/run-hybrid.ts [dataset-dir] [--mode=hybrid|vector|fulltext]
//     [--text-weight=0.5] [--vector-weight=0.5] [--similarity=0.3]
//     [--model=Xenova/all-MiniLM-L6-v2] [--max-docs=N] [--max-queries=N]

import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import { loadDataset, type EvalDataset } from "./dataset";
import {
  buildEngine,
  evaluate,
  NDCG_AT_K,
  P_AT_K,
  pct,
  RECALL_AT_K,
  relevanceFor,
  RETRIEVAL_LIMIT,
  scoreQuery,
  summarize,
  type MetricSummary,
  type QueryResult,
} from "./harness";
import { DEFAULT_MODEL, embedWithCache } from "./hybrid/embedder";
import {
  OramaHybridEngine,
  type OramaMode,
} from "./hybrid/oramaEngine";

const here = import.meta.dirname;
const cacheDir = join(here, "datasets", ".cache");
const reportsDir = join(here, "reports", "hybrid");

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith("--"));
const datasetDir = positional[0] ?? join(here, "datasets", "topic-clusters");

function flag(prefix: string): string | undefined {
  const m = args.find((a) => a.startsWith(prefix));
  return m ? m.slice(prefix.length) : undefined;
}
function num(prefix: string): number | undefined {
  const v = flag(prefix);
  return v === undefined ? undefined : Number(v);
}

const mode = (flag("--mode=") ?? "hybrid") as OramaMode;
const textWeight = num("--text-weight=") ?? 0.5;
const vectorWeight = num("--vector-weight=") ?? 0.5;
const similarity = num("--similarity=") ?? 0.3;
const model = flag("--model=") ?? DEFAULT_MODEL;
const maxDocs = num("--max-docs=");
const maxQueries = num("--max-queries=");
const datasetName = basename(datasetDir);

function capCorpus(dataset: EvalDataset): EvalDataset {
  if (maxDocs === undefined || dataset.corpus.length <= maxDocs) return dataset;
  return { ...dataset, corpus: dataset.corpus.slice(0, maxDocs) };
}

// Async evaluation mirroring harness.evaluate but for the Orama engine: embed
// each query, search, apply the dataset's self-exclusion rule, score.
async function evaluateOrama(
  dataset: EvalDataset,
  engine: OramaHybridEngine,
  queryVectors: Map<number, Float32Array>,
): Promise<QueryResult[]> {
  const results: QueryResult[] = [];
  const { selfExclusion } = dataset.config;
  let scored = 0;
  for (const query of dataset.queries) {
    if (maxQueries !== undefined && scored >= maxQueries) break;
    const relevance = relevanceFor(dataset.qrels, query.id);
    let hasRel = false;
    for (const g of relevance.values()) if (g > 0) hasRel = true;
    if (!hasRel) continue;

    const hits = await engine.searchScored(
      query.text,
      RETRIEVAL_LIMIT,
      queryVectors.get(query.id),
    );
    const ids = hits.map((h) => h.id);
    const ranked = selfExclusion ? ids.filter((id) => id !== query.id) : ids;
    results.push(scoreQuery(query, ranked, relevance));
    scored++;
  }
  return results;
}

function row(label: string, s: MetricSummary): string {
  return (
    `  ${label.padEnd(16)} ${pct(s.precisionAt5)} ${pct(s.ndcgAt10)} ` +
    `${pct(s.recallAt10)} ${pct(s.mrr)} ${pct(s.map)}`
  );
}

function comparisonMarkdown(
  base: MetricSummary,
  orama: MetricSummary,
  oramaLabel: string,
  generatedAt: string,
): string {
  const lines: string[] = [];
  lines.push("# Hybrid search PoC — comparison", "");
  lines.push(`- Generated: ${generatedAt}`);
  lines.push(`- Dataset: \`${datasetDir}\``);
  lines.push(`- Embedding model: \`${model}\``);
  lines.push(`- Retrieval limit: ${RETRIEVAL_LIMIT}`);
  lines.push(`- Queries scored: ${base.queries}`, "");
  lines.push("| Engine | P@" + P_AT_K + " | nDCG@" + NDCG_AT_K + " | Recall@" + RECALL_AT_K + " | MRR | MAP |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  const r = (label: string, s: MetricSummary) =>
    `| ${label} | ${pct(s.precisionAt5).trim()} | ${pct(s.ndcgAt10).trim()} | ` +
    `${pct(s.recallAt10).trim()} | ${pct(s.mrr).trim()} | ${pct(s.map).trim()} |`;
  lines.push(r("MiniSearch (lexical)", base));
  lines.push(r(oramaLabel, orama));
  lines.push("");
  const dNdcg = (orama.ndcgAt10 - base.ndcgAt10) * 100;
  const dMrr = (orama.mrr - base.mrr) * 100;
  lines.push(
    `Δ vs MiniSearch: nDCG@${NDCG_AT_K} ${dNdcg >= 0 ? "+" : ""}${dNdcg.toFixed(1)} pts, ` +
    `MRR ${dMrr >= 0 ? "+" : ""}${dMrr.toFixed(1)} pts.`,
    "",
  );
  return lines.join("\n");
}

async function main(): Promise<void> {
  const dataset = capCorpus(loadDataset(datasetDir));
  const oramaLabel =
    mode === "hybrid"
      ? `Orama hybrid (${textWeight}/${vectorWeight})`
      : `Orama ${mode}`;

  console.log(`\nHybrid PoC — dataset: ${datasetName}`);
  console.log(
    `Corpus: ${dataset.corpus.length} docs · queries: ${dataset.queries.length} · ` +
    `mode: ${mode} · model: ${model}`,
  );

  // 1) MiniSearch baseline (sync, over the same corpus).
  const baseline = summarize(
    evaluate(dataset, buildEngine(dataset), { maxQueries }),
  );

  // 2) Embeddings (cached) for corpus + judged queries.
  const { dim, vectors } = await embedWithCache({
    cacheKey: `${datasetName}.corpus`,
    items: dataset.corpus,
    model,
    cacheDir,
    label: "corpus",
  });

  const judged = dataset.queries.filter((q) => {
    const rel = relevanceFor(dataset.qrels, q.id);
    for (const g of rel.values()) if (g > 0) return true;
    return false;
  });
  const { vectors: qVecs } = await embedWithCache({
    cacheKey: `${datasetName}.queries`,
    items: judged,
    model,
    cacheDir,
    label: "queries",
  });
  const queryVectors = new Map<number, Float32Array>();
  judged.forEach((q, i) => queryVectors.set(q.id, qVecs[i]));

  // 3) Orama engine.
  console.log(`  indexing Orama (${mode}) ...`);
  const engine = new OramaHybridEngine({
    dim,
    mode,
    hybridWeights: { text: textWeight, vector: vectorWeight },
    similarity,
  });
  await engine.indexAll(dataset.corpus, vectors);
  const oramaResults = await evaluateOrama(dataset, engine, queryVectors);
  const oramaSummary = summarize(oramaResults);

  // 4) Report.
  console.log(`\n  Engine           P@${P_AT_K}   nDCG@${NDCG_AT_K} Recall@${RECALL_AT_K}  MRR    MAP`);
  console.log(row("MiniSearch", baseline));
  console.log(row(oramaLabel, oramaSummary));
  const dNdcg = (oramaSummary.ndcgAt10 - baseline.ndcgAt10) * 100;
  console.log(
    `\n  Δ nDCG@${NDCG_AT_K}: ${dNdcg >= 0 ? "+" : ""}${dNdcg.toFixed(1)} pts vs MiniSearch\n`,
  );

  const generatedAt = new Date().toISOString();
  mkdirSync(reportsDir, { recursive: true });
  writeFileSync(
    join(reportsDir, `${datasetName}.json`),
    JSON.stringify(
      {
        generatedAt,
        dataset: datasetDir,
        model,
        mode,
        hybridWeights: { text: textWeight, vector: vectorWeight },
        similarity,
        retrievalLimit: RETRIEVAL_LIMIT,
        baseline,
        orama: oramaSummary,
      },
      null,
      2,
    ) + "\n",
  );
  writeFileSync(
    join(reportsDir, `${datasetName}.md`),
    comparisonMarkdown(baseline, oramaSummary, oramaLabel, generatedAt),
  );
  console.log(`Wrote comparison to ${join(reportsDir, datasetName)}.{json,md}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
