// Import a BEIR benchmark dataset into our evaluation format.
//
// BEIR ships each dataset as a zip containing:
//   corpus.jsonl   — {"_id", "title", "text", ...}     (the searchable pool)
//   queries.jsonl  — {"_id", "text", ...}              (test + dev queries)
//   qrels/<split>.tsv — header `query-id\tcorpus-id\tscore`, then judgments
//
// Some datasets (e.g. CQADupStack) nest one such tree per sub-collection; use
// --subdir=<name> to select one.
//
// We convert to the loader format used by run.ts / experiments.ts:
//   datasets/<out>/corpus.jsonl   — {"id", "text"}
//   datasets/<out>/queries.jsonl  — {"id", "text"}   (filtered to the split)
//   datasets/<out>/qrels.tsv      — queryId\tdocId\tgrade (no header)
//   datasets/<out>/config.json    — { selfExclusion, ... }
//
// Id handling: BEIR ids are arbitrary strings — numeric for Quora, hyphenated
// slugs for ArguAna. Our engine keys on numbers, so we assign each distinct id
// string a stable integer via one *shared* map across corpus, queries and
// qrels. Sharing the map matters: when a query's own passage also appears in
// the corpus (ArguAna) both sides collapse to the same integer so self-
// exclusion can drop it; when the query and corpus id namespaces are disjoint
// (Quora) they never collide. `selfExclusion` is auto-detected from whether any
// query id also occurs as a corpus id.
//
// Usage:
//   tsx scripts/eval/import-beir.ts <name> [--split test|dev] [--subdir NAME]
//                                          [--url URL] [--zip PATH] [--allow-large]

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BEIR_BASE =
  "https://public.ukp.informatik.tu-darmstadt.de/thakur/BEIR/datasets";

// Datasets whose BEIR zip is very large; refuse to auto-download unless the
// caller passes --allow-large (or supplies a local --zip).
const LARGE_DATASETS = new Set(["cqadupstack"]);

const here = import.meta.dirname;
const cacheDir = join(here, "datasets", ".cache");

const args = process.argv.slice(2);
const positional = args.filter((arg) => !arg.startsWith("--"));
const name = positional[0];
if (!name) {
  console.error(
    "Usage: tsx scripts/eval/import-beir.ts <name> [--split test|dev] " +
    "[--subdir NAME] [--url URL] [--zip PATH] [--allow-large]",
  );
  process.exit(1);
}

function flag(prefix: string): string | undefined {
  const match = args.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

const split = flag("--split=") ?? "test";
const subdir = flag("--subdir=");
const url = flag("--url=") ?? `${BEIR_BASE}/${name}.zip`;
const zipOverride = flag("--zip=");
const allowLarge = args.includes("--allow-large");

const outName = subdir ? `${name}-${subdir}` : name;

interface BeirCorpusDoc {
  _id: string;
  title?: string;
  text: string;
}

interface BeirQuery {
  _id: string;
  text: string;
}

function nonEmptyLines(path: string): string[] {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

async function ensureExtracted(): Promise<string> {
  const rawBase = join(cacheDir, name);
  const rawDir = subdir ? join(rawBase, subdir) : rawBase;
  if (existsSync(join(rawDir, "corpus.jsonl"))) {
    console.log(`Using cached extraction: ${rawDir}`);
    return rawDir;
  }

  mkdirSync(cacheDir, { recursive: true });
  const zipPath = zipOverride ?? join(cacheDir, `${name}.zip`);

  if (!existsSync(zipPath)) {
    if (LARGE_DATASETS.has(name) && !allowLarge) {
      throw new Error(
        `"${name}" ships as a very large BEIR zip. Refusing to auto-download.\n` +
        `Pass --allow-large to download anyway, or --zip=<path> to use a ` +
        `local copy, then re-run (optionally with --subdir=<collection>).`,
      );
    }
    console.log(`Downloading ${url} ...`);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Download failed: HTTP ${res.status} for ${url}`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    writeFileSync(zipPath, buffer);
    console.log(`Saved ${(buffer.length / 1e6).toFixed(1)} MB to ${zipPath}`);
  } else {
    console.log(`Using cached zip: ${zipPath}`);
  }

  console.log(`Unzipping into ${cacheDir} ...`);
  execFileSync("unzip", ["-oq", zipPath, "-d", cacheDir]);
  if (!existsSync(join(rawDir, "corpus.jsonl"))) {
    throw new Error(
      `Expected ${join(rawDir, "corpus.jsonl")} after unzip — check --subdir ` +
      `or the archive layout.`,
    );
  }
  return rawDir;
}

// Stable string -> integer id assignment, shared across corpus/queries/qrels.
const idMap = new Map<string, number>();
let nextId = 1;
function toId(raw: string): number {
  let id = idMap.get(raw);
  if (id === undefined) {
    id = nextId++;
    idMap.set(raw, id);
  }
  return id;
}

function readQrelQueryIds(rawDir: string): {
  queryIds: Set<string>;
  rawRows: Array<[string, string, number]>;
} {
  const path = join(rawDir, "qrels", `${split}.tsv`);
  const queryIds = new Set<string>();
  const rawRows: Array<[string, string, number]> = [];
  for (const line of nonEmptyLines(path)) {
    const [qid, did, score] = line.split("\t");
    if (qid === "query-id") continue; // header
    const grade = Number(score);
    if (!qid || !did || !Number.isFinite(grade)) continue;
    queryIds.add(qid);
    rawRows.push([qid, did, grade]);
  }
  return { queryIds, rawRows };
}

function convertCorpus(rawDir: string): {
  lines: string[];
  corpusIds: Set<string>;
} {
  const lines: string[] = [];
  const corpusIds = new Set<string>();
  for (const line of nonEmptyLines(join(rawDir, "corpus.jsonl"))) {
    const doc = JSON.parse(line) as BeirCorpusDoc;
    const title = (doc.title ?? "").trim();
    const body = doc.text.trim();
    const text = title ? `${title} ${body}`.trim() : body;
    if (!text) continue;
    corpusIds.add(doc._id);
    lines.push(JSON.stringify({ id: toId(doc._id), text }));
  }
  return { lines, corpusIds };
}

function convertQueries(rawDir: string, keep: Set<string>): string[] {
  const lines: string[] = [];
  for (const line of nonEmptyLines(join(rawDir, "queries.jsonl"))) {
    const query = JSON.parse(line) as BeirQuery;
    if (!keep.has(query._id)) continue; // keep only queries in this split
    const text = query.text.trim();
    if (!text) continue;
    lines.push(JSON.stringify({ id: toId(query._id), text }));
  }
  return lines;
}

function remapQrels(rawRows: Array<[string, string, number]>): string[] {
  const rows: string[] = [];
  for (const [qid, did, grade] of rawRows) {
    // Both ids must already be known from the corpus/queries passes; minting a
    // fresh id here would reference a document that does not exist.
    const q = idMap.get(qid);
    const d = idMap.get(did);
    if (q === undefined || d === undefined) continue;
    rows.push(`${q}\t${d}\t${grade}`);
  }
  return rows;
}

async function main(): Promise<void> {
  const rawDir = await ensureExtracted();
  const outDir = join(here, "datasets", outName);
  mkdirSync(outDir, { recursive: true });

  const { queryIds, rawRows } = readQrelQueryIds(rawDir);
  const { lines: corpusLines, corpusIds } = convertCorpus(rawDir);
  const queryLines = convertQueries(rawDir, queryIds);
  const qrelRows = remapQrels(rawRows);

  // Self-exclusion is needed only when a query can be its own corpus document.
  const selfExclusion = [...queryIds].some((qid) => corpusIds.has(qid));

  writeFileSync(join(outDir, "corpus.jsonl"), corpusLines.join("\n") + "\n");
  writeFileSync(join(outDir, "queries.jsonl"), queryLines.join("\n") + "\n");
  writeFileSync(join(outDir, "qrels.tsv"), qrelRows.join("\n") + "\n");
  writeFileSync(
    join(outDir, "config.json"),
    JSON.stringify(
      {
        name: outName,
        source: url,
        split,
        ...(subdir ? { subdir } : {}),
        selfExclusion,
        note:
          "Imported BEIR dataset. Ids remapped to integers via a shared map; " +
          "selfExclusion auto-detected from query/corpus id overlap.",
      },
      null,
      2,
    ) + "\n",
  );

  console.log(`\nImported "${outName}" (${split} split) -> ${outDir}`);
  console.log(`  corpus:  ${corpusLines.length} docs`);
  console.log(`  queries: ${queryLines.length} (judged)`);
  console.log(`  qrels:   ${qrelRows.length} judgments`);
  console.log(`  selfExclusion: ${selfExclusion}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
