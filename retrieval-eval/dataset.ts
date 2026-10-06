// Types and loaders for BEIR-style evaluation datasets:
//
//   corpus.jsonl   — one {"id", "text", "topic"?} document per line
//   queries.jsonl  — one {"id", "text", "topic"?} query per line
//   qrels.tsv      — tab-separated `queryId<TAB>docId<TAB>grade` rows
//
// Ids are numbers so they map directly onto the search engine's numeric id
// space. `topic` is optional metadata used only for per-topic reporting; the
// relevance judgments themselves come exclusively from qrels.tsv, which keeps
// the harness compatible with external datasets that ship explicit qrels.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface CorpusDoc {
  id: number;
  text: string;
  topic?: string;
}

export interface EvalQuery {
  id: number;
  text: string;
  topic?: string;
}

/** queryId -> (docId -> grade). */
export type Qrels = Map<number, Map<number, number>>;

// Optional per-dataset config.json. The only load-bearing field is
// `selfExclusion`: our generated datasets (e.g. topic-clusters) use each
// statement as both a query and a corpus document sharing one id, so the
// harness must drop a returned doc when its id equals the query id. External
// BEIR datasets (e.g. Quora) keep queries and corpus in *separate* id
// namespaces that merely overlap numerically, so excluding by id would wrongly
// discard a legitimate document — those datasets ship `selfExclusion: false`.
export interface DatasetConfig {
  name?: string;
  source?: string;
  selfExclusion: boolean;
}

export interface EvalDataset {
  corpus: CorpusDoc[];
  queries: EvalQuery[];
  qrels: Qrels;
  config: DatasetConfig;
}

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as T);
}

function loadQrels(path: string): Qrels {
  const qrels: Qrels = new Map();
  for (const row of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = row.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [queryId, docId, grade] = trimmed.split("\t");
    const q = Number(queryId);
    const d = Number(docId);
    const g = Number(grade);
    if (!Number.isFinite(q) || !Number.isFinite(d) || !Number.isFinite(g)) {
      continue;
    }
    let judgments = qrels.get(q);
    if (!judgments) {
      judgments = new Map();
      qrels.set(q, judgments);
    }
    judgments.set(d, g);
  }
  return qrels;
}

function loadConfig(dir: string): DatasetConfig {
  const path = join(dir, "config.json");
  // Absent config.json => default to self-exclusion (our generated datasets).
  if (!existsSync(path)) return { selfExclusion: true };
  const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<DatasetConfig>;
  return {
    name: raw.name,
    source: raw.source,
    selfExclusion: raw.selfExclusion ?? true,
  };
}

export function loadDataset(dir: string): EvalDataset {
  return {
    corpus: readJsonl<CorpusDoc>(join(dir, "corpus.jsonl")),
    queries: readJsonl<EvalQuery>(join(dir, "queries.jsonl")),
    qrels: loadQrels(join(dir, "qrels.tsv")),
    config: loadConfig(dir),
  };
}
