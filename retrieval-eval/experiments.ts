// Search parameter-sweep harness.
//
// Runs a set of tuning experiments against the *real* MiniSearchEngine (each
// experiment just passes a different EngineConfig) and writes one report per
// experiment plus a comparison summary. Every report records the exact
// parameters that produced it, so results are reproducible and self-describing.
//
// Usage:
//   npx tsx scripts/eval/experiments.ts [dataset-dir]
//
// Outputs (under scripts/eval/reports/experiments/):
//   <id>/report.json  + <id>/report.md   — per-experiment detail
//   summary.json      + summary.md        — cross-experiment comparison
//
// The `baseline` experiment uses no overrides, so its numbers must match the
// canonical report from run.ts — a built-in parity check.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { SearchOptions } from "minisearch";
import type { EngineConfig } from "../frontend/src/localSearch/engine";
import { STOP_WORDS } from "../frontend/src/localSearch/stopwords";
import { loadDataset } from "./dataset";
import {
  buildEngine,
  evaluate,
  fixed,
  NDCG_AT_K,
  P_AT_K,
  pct,
  RECALL_AT_K,
  summarize,
  summarizeByTopic,
  worstQueries,
  type MetricSummary,
  type QueryResult,
} from "./harness";

const here = import.meta.dirname;
const datasetDir = process.argv[2] ?? join(here, "datasets", "topic-clusters");
const experimentsDir = join(here, "reports", "experiments");

// MiniSearch's default BM25 parameters. When overriding bm25 we must supply the
// whole object (MiniSearch shallow-merges search options), so start from these.
function bm25(overrides: { k?: number; b?: number; d?: number }): SearchOptions {
  return { bm25: { k: 1.2, b: 0.7, d: 0.5, ...overrides } };
}

// Topically-neutral civic filler words that recur across every topic and drive
// cross-topic false matches (e.g. "public safety" vs "public health"). Kept
// deliberately free of topic-defining terms (reform, climate, gun, space, ...).
const NEUTRAL_STOPWORDS = [
  "public",
  "federal",
  "government",
  "national",
  "united",
  "states",
  "state",
  "america",
  "american",
  "americans",
  "people",
  "every",
  "country",
  "nation",
  "policy",
  "program",
  "programs",
  "system",
  "systems",
  "rules",
];

interface Experiment {
  id: string;
  label: string;
  hypothesis: string;
  /** Similarity-mode search-option overrides (shallow-merged over defaults). */
  similarityOptions?: SearchOptions;
  /** Extra words added on top of the production STOP_WORDS set. */
  extraStopWords?: string[];
  minTermLength?: number;
}

const EXPERIMENTS: Experiment[] = [
  {
    id: "baseline",
    label: "Baseline (production)",
    hypothesis:
      "Reference point: combineWith OR, fuzzy 0.1. Must match the canonical report.",
  },
  {
    id: "no-fuzzy",
    label: "Fuzzy off",
    hypothesis:
      "Fuzzy 0.1 causes stem collisions (e.g. 'spaces'->'space') that pull in " +
      "off-topic hits. Turning it off should raise precision.",
    similarityOptions: { combineWith: "OR", fuzzy: 0 },
  },
  {
    id: "fuzzy-weight-low",
    label: "Fuzzy down-weighted",
    hypothesis:
      "Keep typo tolerance but let fuzzy matches contribute less than exact ones.",
    similarityOptions: {
      combineWith: "OR",
      fuzzy: 0.1,
      weights: { fuzzy: 0.2, prefix: 0.375 },
    },
  },
  {
    id: "bm25-b-low",
    label: "BM25 b=0.3",
    hypothesis:
      "Less length normalization; short generic docs get less of a boost.",
    similarityOptions: { combineWith: "OR", fuzzy: 0.1, ...bm25({ b: 0.3 }) },
  },
  {
    id: "bm25-b-high",
    label: "BM25 b=1.0",
    hypothesis:
      "Full length normalization; penalize long docs that share only common words.",
    similarityOptions: { combineWith: "OR", fuzzy: 0.1, ...bm25({ b: 1.0 }) },
  },
  {
    id: "bm25-k-low",
    label: "BM25 k=0.6",
    hypothesis:
      "Faster term-frequency saturation so distinctive rare terms dominate less by repetition.",
    similarityOptions: { combineWith: "OR", fuzzy: 0.1, ...bm25({ k: 0.6 }) },
  },
  {
    id: "expanded-stopwords",
    label: "Expanded stop-words",
    hypothesis:
      "Drop neutral civic filler ('public', 'federal', 'United States', ...) so " +
      "matches rest on topic-bearing words.",
    extraStopWords: NEUTRAL_STOPWORDS,
  },
  {
    id: "no-fuzzy-stopwords",
    label: "Fuzzy off + expanded stop-words",
    hypothesis: "Combine the two most promising single levers.",
    similarityOptions: { combineWith: "OR", fuzzy: 0 },
    extraStopWords: NEUTRAL_STOPWORDS,
  },
  {
    id: "and-combine",
    label: "combineWith AND (no fuzzy)",
    hypothesis:
      "Require every query term. Expect much higher precision but lower recall — a reference extreme.",
    similarityOptions: { combineWith: "AND", fuzzy: 0 },
  },
];

interface ExperimentParams {
  similarityOptions: SearchOptions | string;
  extraStopWords: string[];
  minTermLength: number;
}

function toEngineConfig(exp: Experiment): EngineConfig {
  return {
    similarityOptions: exp.similarityOptions,
    stopWords: exp.extraStopWords
      ? new Set([...STOP_WORDS, ...exp.extraStopWords])
      : undefined,
    minTermLength: exp.minTermLength,
  };
}

function toParams(exp: Experiment): ExperimentParams {
  return {
    similarityOptions:
      exp.similarityOptions ?? "default (combineWith: OR, fuzzy: 0.1)",
    extraStopWords: exp.extraStopWords ?? [],
    minTermLength: exp.minTermLength ?? 2,
  };
}

interface ExperimentResult {
  experiment: Experiment;
  params: ExperimentParams;
  overall: MetricSummary;
  perTopic: Map<string, MetricSummary>;
  worst: QueryResult[];
}

function runExperiment(
  dataset: ReturnType<typeof loadDataset>,
  exp: Experiment,
): ExperimentResult {
  const engine = buildEngine(dataset, toEngineConfig(exp));
  const results = evaluate(dataset, engine);
  return {
    experiment: exp,
    params: toParams(exp),
    overall: summarize(results),
    perTopic: summarizeByTopic(results),
    worst: worstQueries(results),
  };
}

function experimentMarkdown(result: ExperimentResult): string {
  const { experiment, params, overall, perTopic, worst } = result;
  const lines: string[] = [];
  lines.push(`# Experiment: ${experiment.label}`, "");
  lines.push(`- Id: \`${experiment.id}\``);
  lines.push(`- Hypothesis: ${experiment.hypothesis}`, "");

  lines.push("## Parameters", "");
  lines.push("```json");
  lines.push(JSON.stringify(params, null, 2));
  lines.push("```", "");

  lines.push("## Overall", "");
  lines.push("| Metric | Value |", "| --- | --- |");
  lines.push(`| P@${P_AT_K} | ${pct(overall.precisionAt5).trim()} |`);
  lines.push(`| nDCG@${NDCG_AT_K} | ${pct(overall.ndcgAt10).trim()} |`);
  lines.push(`| Recall@${RECALL_AT_K} | ${pct(overall.recallAt10).trim()} |`);
  lines.push(`| MRR | ${pct(overall.mrr).trim()} |`);
  lines.push(`| MAP | ${pct(overall.map).trim()} |`, "");

  lines.push("## Per topic", "");
  lines.push(
    `| Topic | P@${P_AT_K} | nDCG@${NDCG_AT_K} | Recall@${RECALL_AT_K} | MRR | Queries |`,
  );
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const [topic, s] of [...perTopic.entries()].sort(
    (a, b) => a[1].ndcgAt10 - b[1].ndcgAt10,
  )) {
    lines.push(
      `| ${topic} | ${pct(s.precisionAt5).trim()} | ${pct(s.ndcgAt10).trim()} | ` +
      `${pct(s.recallAt10).trim()} | ${pct(s.mrr).trim()} | ${s.queries} |`,
    );
  }
  lines.push("");

  lines.push(`## Worst ${worst.length} queries by nDCG@${NDCG_AT_K}`, "");
  lines.push(`| Query id | Topic | nDCG@${NDCG_AT_K} | P@${P_AT_K} | Statement |`);
  lines.push("| --- | --- | --- | --- | --- |");
  for (const r of worst) {
    lines.push(
      `| ${r.queryId} | ${r.topic ?? ""} | ${fixed(r.ndcg)} | ${fixed(r.precision)} | ` +
      `${r.text.replace(/\|/g, "\\|")} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

function signed(delta: number): string {
  const p = (delta * 100).toFixed(1);
  return delta >= 0 ? `+${p}` : p;
}

function summaryMarkdown(
  results: ExperimentResult[],
  baseline: MetricSummary,
  generatedAt: string,
): string {
  const lines: string[] = [];
  lines.push("# Search tuning — experiment comparison", "");
  lines.push(`- Generated: ${generatedAt}`);
  lines.push(`- Dataset: \`${datasetDir}\``);
  lines.push(`- Baseline: \`baseline\` (production config)`, "");
  lines.push(
    "Sorted by nDCG@10. Δ columns are absolute percentage-point changes vs baseline.",
    "",
  );
  lines.push(
    `| Experiment | P@${P_AT_K} | nDCG@${NDCG_AT_K} | ΔnDCG | Recall@${RECALL_AT_K} | MRR | MAP | ΔMAP |`,
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  const sorted = [...results].sort(
    (a, b) => b.overall.ndcgAt10 - a.overall.ndcgAt10,
  );
  for (const { experiment, overall } of sorted) {
    lines.push(
      `| ${experiment.label} (\`${experiment.id}\`) | ` +
      `${pct(overall.precisionAt5).trim()} | ${pct(overall.ndcgAt10).trim()} | ` +
      `${signed(overall.ndcgAt10 - baseline.ndcgAt10)} | ` +
      `${pct(overall.recallAt10).trim()} | ${pct(overall.mrr).trim()} | ` +
      `${pct(overall.map).trim()} | ${signed(overall.map - baseline.map)} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

function printSummary(
  results: ExperimentResult[],
  baseline: MetricSummary,
): void {
  console.log("\nExperiment comparison (sorted by nDCG@10)\n");
  console.log(
    `  ${"experiment".padEnd(28)} ${"P@5".padStart(7)} ${"nDCG@10".padStart(8)} ` +
    `${"ΔnDCG".padStart(7)} ${"MRR".padStart(7)} ${"MAP".padStart(7)}`,
  );
  const sorted = [...results].sort(
    (a, b) => b.overall.ndcgAt10 - a.overall.ndcgAt10,
  );
  for (const { experiment, overall } of sorted) {
    console.log(
      `  ${experiment.id.padEnd(28)} ${pct(overall.precisionAt5)} ${pct(overall.ndcgAt10)} ` +
      `${signed(overall.ndcgAt10 - baseline.ndcgAt10).padStart(7)} ` +
      `${pct(overall.mrr)} ${pct(overall.map)}`,
    );
  }
  console.log("");
}

function main(): void {
  const dataset = loadDataset(datasetDir);
  const results = EXPERIMENTS.map((exp) => runExperiment(dataset, exp));

  const baseline = results.find((r) => r.experiment.id === "baseline")?.overall;
  if (!baseline) throw new Error("No 'baseline' experiment defined.");

  const generatedAt = new Date().toISOString();
  mkdirSync(experimentsDir, { recursive: true });

  for (const result of results) {
    const dir = join(experimentsDir, result.experiment.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "report.json"),
      JSON.stringify(
        {
          generatedAt,
          dataset: datasetDir,
          experiment: {
            id: result.experiment.id,
            label: result.experiment.label,
            hypothesis: result.experiment.hypothesis,
          },
          params: result.params,
          overall: result.overall,
          perTopic: Object.fromEntries(result.perTopic),
          worst: result.worst,
        },
        null,
        2,
      ) + "\n",
    );
    writeFileSync(join(dir, "report.md"), experimentMarkdown(result));
  }

  writeFileSync(
    join(experimentsDir, "summary.json"),
    JSON.stringify(
      {
        generatedAt,
        dataset: datasetDir,
        baselineId: "baseline",
        experiments: results.map((r) => ({
          id: r.experiment.id,
          label: r.experiment.label,
          params: r.params,
          overall: r.overall,
          deltaNdcg10: r.overall.ndcgAt10 - baseline.ndcgAt10,
          deltaMap: r.overall.map - baseline.map,
        })),
      },
      null,
      2,
    ) + "\n",
  );
  writeFileSync(
    join(experimentsDir, "summary.md"),
    summaryMarkdown(results, baseline, generatedAt),
  );

  printSummary(results, baseline);
  console.log(`Wrote ${results.length} experiment reports to ${experimentsDir}`);
}

main();
