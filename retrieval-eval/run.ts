// Search evaluation harness.
//
// Indexes an evaluation corpus with the *real* browser-local search engine
// (MiniSearchEngine — the exact class the site uses via the search worker) and
// scores similarity-mode retrieval against a static qrels file. Because it
// imports the production engine rather than reimplementing search, the numbers
// here track whatever the site actually does.
//
// Usage:
//   npx tsx scripts/eval/run.ts [dataset-dir] [--case-study]
//
// Defaults to the bundled "topic-clusters" dataset. Prints a summary table and
// writes report.json + report.md to scripts/eval/reports/. Pass --case-study to
// additionally dump, for each of the worst queries, the exact statements the
// engine returned along with their scores and relevance — handy for telling
// apart "retrieval returned nothing" from "ranked the wrong things first".
//
// Note on parity: the site indexes a bounded working set (ranked + recent
// statements) whereas this harness indexes the full evaluation corpus. That is
// deliberate — the dataset defines the candidate pool, so we measure *ranking
// quality* given the relevant documents are present, independent of coverage.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { loadDataset, type CorpusDoc, type EvalDataset } from "./dataset";
import {
  buildEngine,
  evaluate,
  fixed,
  NDCG_AT_K,
  P_AT_K,
  pct,
  RECALL_AT_K,
  relevanceFor,
  RETRIEVAL_LIMIT,
  SEARCH_MODE,
  summarize,
  summarizeByTopic,
  worstQueries,
  type MetricSummary,
  type QueryResult,
} from "./harness";
import { MiniSearchEngine } from "../frontend/src/localSearch/engine";

// How many returned statements to show per query in the case study.
const CASE_STUDY_DEPTH = 10;

const here = import.meta.dirname;
const args = process.argv.slice(2);
const caseStudyEnabled = args.includes("--case-study");
const positional = args.filter((arg) => !arg.startsWith("--"));
const datasetDir = positional[0] ?? join(here, "datasets", "topic-clusters");
const reportsDir = join(here, "reports");

// Optional cap on how many judged queries to score (--max-queries=N). Handy for
// large external corpora where a full sweep is slow; omit for an exhaustive run.
const maxQueriesArg = args.find((arg) => arg.startsWith("--max-queries="));
const maxQueries = maxQueriesArg
  ? Number(maxQueriesArg.slice("--max-queries=".length))
  : undefined;

// One returned statement in a case-study listing.
interface CaseStudyHit {
  rank: number;
  docId: number;
  score: number;
  relevant: boolean;
  topic: string | undefined;
  text: string;
}

// A case study for a single (worst-performing) query.
interface CaseStudyEntry {
  queryId: number;
  topic: string | undefined;
  text: string;
  ndcg: number;
  precision: number;
  relevantTotal: number;
  returnedTotal: number;
  hits: CaseStudyHit[];
}

// For each supplied query, re-run the search keeping scores so we can see
// exactly which statements came back and whether they were relevant.
function buildCaseStudies(
  dataset: EvalDataset,
  engine: MiniSearchEngine,
  queries: QueryResult[],
): CaseStudyEntry[] {
  const corpusById = new Map<number, CorpusDoc>(
    dataset.corpus.map((doc) => [doc.id, doc]),
  );
  const { selfExclusion } = dataset.config;

  return queries.map((query) => {
    const relevance = relevanceFor(dataset.qrels, query.queryId);
    const scored = engine
      .searchScored(query.text, SEARCH_MODE, RETRIEVAL_LIMIT)
      .filter((result) => !selfExclusion || result.id !== query.queryId);

    const hits: CaseStudyHit[] = scored
      .slice(0, CASE_STUDY_DEPTH)
      .map((result, index) => {
        const doc = corpusById.get(result.id);
        return {
          rank: index + 1,
          docId: result.id,
          score: result.score,
          relevant: (relevance.get(result.id) ?? 0) > 0,
          topic: doc?.topic,
          text: doc?.text ?? "",
        };
      });

    return {
      queryId: query.queryId,
      topic: query.topic,
      text: query.text,
      ndcg: query.ndcg,
      precision: query.precision,
      relevantTotal: [...relevance.values()].filter((g) => g > 0).length,
      returnedTotal: scored.length,
      hits,
    };
  });
}

function printReport(
  overall: MetricSummary,
  byTopic: Map<string, MetricSummary>,
  worst: QueryResult[],
): void {
  console.log(`\nSearch evaluation — mode: ${SEARCH_MODE}`);
  console.log(`Dataset: ${datasetDir}`);
  console.log(`Queries scored: ${overall.queries}\n`);

  console.log("Overall");
  console.log(`  P@${P_AT_K}       ${pct(overall.precisionAt5)}`);
  console.log(`  nDCG@${NDCG_AT_K}   ${pct(overall.ndcgAt10)}`);
  console.log(`  Recall@${RECALL_AT_K} ${pct(overall.recallAt10)}`);
  console.log(`  MRR       ${pct(overall.mrr)}`);
  console.log(`  MAP       ${pct(overall.map)}\n`);

  console.log("Per topic (P@5 / nDCG@10 / MRR)");
  const topics = [...byTopic.entries()].sort(
    (a, b) => a[1].ndcgAt10 - b[1].ndcgAt10,
  );
  for (const [topic, summary] of topics) {
    console.log(
      `  ${topic.padEnd(18)} ${pct(summary.precisionAt5)}  ` +
      `${pct(summary.ndcgAt10)}  ${pct(summary.mrr)}`,
    );
  }

  console.log(`\nWorst ${worst.length} queries by nDCG@${NDCG_AT_K}`);
  for (const result of worst) {
    const snippet =
      result.text.length > 70
        ? result.text.slice(0, 67) + "..."
        : result.text;
    console.log(
      `  [${String(result.queryId).padStart(3)}] ` +
      `nDCG=${fixed(result.ndcg)} P@5=${fixed(result.precision)} ` +
      `${result.topic ?? ""}\n        ${snippet}`,
    );
  }
  console.log("");
}

function snippetOf(text: string, max = 64): string {
  return text.length > max ? text.slice(0, max - 3) + "..." : text;
}

function printCaseStudies(caseStudies: CaseStudyEntry[]): void {
  console.log(
    `Case study — top ${caseStudies.length} worst queries ` +
    `(showing up to ${CASE_STUDY_DEPTH} returned statements each)\n`,
  );
  for (const entry of caseStudies) {
    console.log(
      `[${String(entry.queryId).padStart(3)}] ${entry.topic ?? ""} — ` +
      `nDCG@${NDCG_AT_K}=${fixed(entry.ndcg)} P@${P_AT_K}=${fixed(entry.precision)} ` +
      `| relevant=${entry.relevantTotal} returned=${entry.returnedTotal}`,
    );
    console.log(`      Q: ${snippetOf(entry.text, 90)}`);
    if (entry.hits.length === 0) {
      console.log("      (no statements returned — zero lexical overlap)\n");
      continue;
    }
    for (const hit of entry.hits) {
      const mark = hit.relevant ? "✓" : "✗";
      console.log(
        `      ${mark} #${String(hit.rank).padStart(2)} ` +
        `score=${hit.score.toFixed(3).padStart(7)} ` +
        `[${String(hit.docId).padStart(3)}] ${(hit.topic ?? "").padEnd(16)} ` +
        `${snippetOf(hit.text, 58)}`,
      );
    }
    console.log("");
  }
}

function toMarkdown(
  overall: MetricSummary,
  byTopic: Map<string, MetricSummary>,
  worst: QueryResult[],
  generatedAt: string,
): string {
  const lines: string[] = [];
  lines.push("# Search evaluation report", "");
  lines.push(`- Generated: ${generatedAt}`);
  lines.push(`- Dataset: \`${datasetDir}\``);
  lines.push(`- Search mode: \`${SEARCH_MODE}\``);
  lines.push(`- Retrieval limit: ${RETRIEVAL_LIMIT}`);
  lines.push(`- Queries scored: ${overall.queries}`, "");

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
  const topics = [...byTopic.entries()].sort(
    (a, b) => a[1].ndcgAt10 - b[1].ndcgAt10,
  );
  for (const [topic, s] of topics) {
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
    const escaped = r.text.replace(/\|/g, "\\|");
    lines.push(
      `| ${r.queryId} | ${r.topic ?? ""} | ${fixed(r.ndcg)} | ${fixed(r.precision)} | ${escaped} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

function caseStudiesToMarkdown(caseStudies: CaseStudyEntry[]): string {
  const lines: string[] = [];
  lines.push(
    `## Case study — worst ${caseStudies.length} queries`,
    "",
    `Up to ${CASE_STUDY_DEPTH} returned statements per query, with raw ` +
    `similarity scores. ✓ = judged relevant (same topic), ✗ = not relevant.`,
    "",
  );
  for (const entry of caseStudies) {
    lines.push(
      `### [${entry.queryId}] ${entry.topic ?? ""} — nDCG@${NDCG_AT_K} ` +
      `${fixed(entry.ndcg)}, P@${P_AT_K} ${fixed(entry.precision)}`,
      "",
      `> ${entry.text.replace(/\n/g, " ")}`,
      "",
      `Relevant in corpus: ${entry.relevantTotal} · Returned: ${entry.returnedTotal}`,
      "",
    );
    if (entry.hits.length === 0) {
      lines.push("_No statements returned — zero lexical overlap._", "");
      continue;
    }
    lines.push("| Rank | Relevant | Score | Doc id | Topic | Statement |");
    lines.push("| --- | --- | --- | --- | --- | --- |");
    for (const hit of entry.hits) {
      const escaped = hit.text.replace(/\|/g, "\\|");
      lines.push(
        `| ${hit.rank} | ${hit.relevant ? "✓" : "✗"} | ${hit.score.toFixed(3)} | ` +
        `${hit.docId} | ${hit.topic ?? ""} | ${escaped} |`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

function writeReports(
  overall: MetricSummary,
  byTopic: Map<string, MetricSummary>,
  worst: QueryResult[],
  results: QueryResult[],
  caseStudies: CaseStudyEntry[] | null,
): void {
  const generatedAt = new Date().toISOString();
  mkdirSync(reportsDir, { recursive: true });

  const json = {
    generatedAt,
    dataset: datasetDir,
    searchMode: SEARCH_MODE,
    retrievalLimit: RETRIEVAL_LIMIT,
    overall,
    perTopic: Object.fromEntries(byTopic),
    perQuery: results,
    ...(caseStudies ? { caseStudies } : {}),
  };
  writeFileSync(
    join(reportsDir, "report.json"),
    JSON.stringify(json, null, 2) + "\n",
  );
  const markdown = caseStudies
    ? toMarkdown(overall, byTopic, worst, generatedAt) +
    "\n" +
    caseStudiesToMarkdown(caseStudies)
    : toMarkdown(overall, byTopic, worst, generatedAt);
  writeFileSync(join(reportsDir, "report.md"), markdown);
  console.log(`Wrote report.json + report.md to ${reportsDir}`);
}

function main(): void {
  const dataset = loadDataset(datasetDir);
  const engine = buildEngine(dataset);
  const results = evaluate(dataset, engine, { maxQueries });
  if (results.length === 0) {
    throw new Error(`No scorable queries found in ${datasetDir}`);
  }

  const overall = summarize(results);
  const byTopic = summarizeByTopic(results);
  const worst = worstQueries(results);

  printReport(overall, byTopic, worst);

  const caseStudies = caseStudyEnabled
    ? buildCaseStudies(dataset, engine, worst)
    : null;
  if (caseStudies) printCaseStudies(caseStudies);

  writeReports(overall, byTopic, worst, results, caseStudies);
}

main();
