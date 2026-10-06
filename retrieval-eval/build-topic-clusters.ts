// Generates the "topic-clusters" evaluation dataset from the on-chain stress
// fixtures. Each statement becomes both a corpus document and a query; the
// relevant set for a query is every *other* statement in the same topic block
// (binary relevance). This gives us a homegrown, deterministic ground truth
// without any manual labelling.
//
// Regenerate with:  npx tsx scripts/eval/build-topic-clusters.ts
//
// The topic blocks below mirror the contiguous groupings in
// blockchain/fixtures/stress-statements.txt. The script asserts the block
// sizes still sum to the fixture length, so the dataset fails loudly if the
// fixtures are ever edited without updating these counts.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface TopicBlock {
  id: string;
  label: string;
  count: number;
}

const TOPIC_BLOCKS: TopicBlock[] = [
  { id: "healthcare", label: "Universal healthcare", count: 20 },
  { id: "guns", label: "Gun policy", count: 20 },
  { id: "iran", label: "War with Iran", count: 20 },
  { id: "space", label: "Space exploration", count: 20 },
  { id: "budget", label: "Federal budget", count: 20 },
  { id: "processed-foods", label: "Processed foods & American health", count: 14 },
  { id: "climate", label: "Climate change", count: 14 },
  { id: "ukraine", label: "Russo-Ukrainian war", count: 14 },
  { id: "church-state", label: "Separation of church and state", count: 14 },
  { id: "political-reform", label: "Political reform", count: 15 },
  { id: "us-canada", label: "US–Canada relations", count: 14 },
  { id: "world-cup", label: "2026 World Cup", count: 15 },
];

const here = import.meta.dirname;
const repoRoot = join(here, "..");
const fixturesPath = join(
  repoRoot,
  "blockchain",
  "fixtures",
  "stress-statements.txt",
);
const outDir = join(here, "datasets", "topic-clusters");

function loadStatements(): string[] {
  return readFileSync(fixturesPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function main(): void {
  const statements = loadStatements();
  const expected = TOPIC_BLOCKS.reduce((sum, block) => sum + block.count, 0);
  if (statements.length !== expected) {
    throw new Error(
      `Fixture length ${statements.length} does not match topic-block total ` +
      `${expected}. Update TOPIC_BLOCKS in build-topic-clusters.ts to match ` +
      `blockchain/fixtures/stress-statements.txt.`,
    );
  }

  // Map every statement index to its topic id.
  const topicOf: string[] = [];
  for (const block of TOPIC_BLOCKS) {
    for (let i = 0; i < block.count; i++) topicOf.push(block.id);
  }

  const corpusLines: string[] = [];
  const queryLines: string[] = [];
  statements.forEach((text, id) => {
    const record = JSON.stringify({ id, text, topic: topicOf[id] });
    corpusLines.push(record);
    queryLines.push(record);
  });

  // Relevance: same topic, excluding the query statement itself. Grade 1.
  const qrelLines: string[] = [];
  statements.forEach((_text, queryId) => {
    const topic = topicOf[queryId];
    statements.forEach((_docText, docId) => {
      if (docId !== queryId && topicOf[docId] === topic) {
        qrelLines.push(`${queryId}\t${docId}\t1`);
      }
    });
  });

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "corpus.jsonl"), corpusLines.join("\n") + "\n");
  writeFileSync(join(outDir, "queries.jsonl"), queryLines.join("\n") + "\n");
  writeFileSync(join(outDir, "qrels.tsv"), qrelLines.join("\n") + "\n");

  console.log(
    `Wrote topic-clusters dataset to ${outDir}\n` +
    `  ${statements.length} documents / ${statements.length} queries / ` +
    `${qrelLines.length} judgments across ${TOPIC_BLOCKS.length} topics`,
  );
}

main();
