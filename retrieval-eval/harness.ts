// Shared evaluation core used by both the single-run harness (run.ts) and the
// parameter-sweep harness (experiments.ts). Keeping the scoring logic here means
// every entry point measures search the same way; only report formatting
// differs between them.

import { MiniSearchEngine, type EngineConfig } from "../frontend/src/localSearch/engine";
import type { IndexedStatement } from "../frontend/src/localSearch/types";
import type { EvalDataset, Qrels } from "./dataset";
import {
  averagePrecision,
  ndcgAtK,
  precisionAtK,
  recallAtK,
  reciprocalRank,
  type Relevance,
} from "./metrics";

// Mirror the site: useSearch retrieves SEARCH_RESULTS_LIMIT ids then removes the
// query's own statement. VITE_SEARCH_RESULTS_LIMIT defaults to 100.
export const RETRIEVAL_LIMIT = 100;
export const P_AT_K = 5;
export const NDCG_AT_K = 10;
export const RECALL_AT_K = 10;
export const WORST_N = 10;
export const SEARCH_MODE = "similarity" as const;

export interface QueryResult {
  queryId: number;
  topic: string | undefined;
  text: string;
  precision: number;
  ndcg: number;
  recall: number;
  rr: number;
  ap: number;
}

export interface MetricSummary {
  precisionAt5: number;
  ndcgAt10: number;
  recallAt10: number;
  mrr: number;
  map: number;
  queries: number;
}

/** Index the evaluation corpus with a (optionally tuned) engine instance. */
export function buildEngine(
  dataset: EvalDataset,
  config: EngineConfig = {},
): MiniSearchEngine {
  const engine = new MiniSearchEngine(config);
  const documents: IndexedStatement[] = dataset.corpus.map((doc) => ({
    id: doc.id,
    text: doc.text,
  }));
  engine.replaceAll(documents);
  return engine;
}

export function relevanceFor(qrels: Qrels, queryId: number): Relevance {
  return qrels.get(queryId) ?? new Map<number, number>();
}

function hasRelevant(relevance: Relevance): boolean {
  for (const grade of relevance.values()) if (grade > 0) return true;
  return false;
}

/**
 * Turn a ranked id list into a scored QueryResult. Shared by every engine so
 * the metric definitions stay identical regardless of who produced the ranking.
 */
export function scoreQuery(
  query: { id: number; topic: string | undefined; text: string },
  ranked: number[],
  relevance: Relevance,
): QueryResult {
  return {
    queryId: query.id,
    topic: query.topic,
    text: query.text,
    precision: precisionAtK(ranked, relevance, P_AT_K),
    ndcg: ndcgAtK(ranked, relevance, NDCG_AT_K),
    recall: recallAtK(ranked, relevance, RECALL_AT_K),
    rr: reciprocalRank(ranked, relevance),
    ap: averagePrecision(ranked, relevance),
  };
}

export interface EvaluateOptions {
  // Cap the number of *scored* queries (those that have ground truth). Useful
  // for large external corpora where evaluating every query is slow.
  maxQueries?: number;
}

/** Score every judged query against an already-indexed engine. */
export function evaluate(
  dataset: EvalDataset,
  engine: MiniSearchEngine,
  options: EvaluateOptions = {},
): QueryResult[] {
  const results: QueryResult[] = [];
  const { selfExclusion } = dataset.config;

  for (const query of dataset.queries) {
    if (options.maxQueries !== undefined && results.length >= options.maxQueries)
      break;

    const relevance = relevanceFor(dataset.qrels, query.id);
    if (!hasRelevant(relevance)) continue; // no ground truth -> skip

    // The exact call the site makes. For datasets where each statement is both
    // a query and a corpus doc (topic-clusters), exclude the query's own
    // statement to mirror useSearch's similarStatementId filtering. External
    // datasets (Quora) keep queries out of the corpus, so we keep every hit.
    const ids = engine.search(query.text, SEARCH_MODE, RETRIEVAL_LIMIT);
    const ranked = selfExclusion ? ids.filter((id) => id !== query.id) : ids;

    results.push(scoreQuery(query, ranked, relevance));
  }

  return results;
}

export function mean(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function summarize(results: QueryResult[]): MetricSummary {
  return {
    precisionAt5: mean(results.map((r) => r.precision)),
    ndcgAt10: mean(results.map((r) => r.ndcg)),
    recallAt10: mean(results.map((r) => r.recall)),
    mrr: mean(results.map((r) => r.rr)),
    map: mean(results.map((r) => r.ap)),
    queries: results.length,
  };
}

export function summarizeByTopic(
  results: QueryResult[],
): Map<string, MetricSummary> {
  const byTopic = new Map<string, QueryResult[]>();
  for (const result of results) {
    const topic = result.topic ?? "(none)";
    const bucket = byTopic.get(topic);
    if (bucket) bucket.push(result);
    else byTopic.set(topic, [result]);
  }
  const summaries = new Map<string, MetricSummary>();
  for (const [topic, bucket] of byTopic) {
    summaries.set(topic, summarize(bucket));
  }
  return summaries;
}

export function worstQueries(
  results: QueryResult[],
  n: number = WORST_N,
): QueryResult[] {
  return [...results].sort((a, b) => a.ndcg - b.ndcg).slice(0, n);
}

/** Percentage string, right-padded to a fixed width for aligned columns. */
export function pct(value: number): string {
  return (value * 100).toFixed(1).padStart(6) + "%";
}

export function fixed(value: number): string {
  return value.toFixed(4);
}
