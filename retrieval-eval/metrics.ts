// Pure information-retrieval metric functions used by the search evaluation
// harness. Every function takes a ranked list of retrieved document ids (most
// relevant first) plus a relevance map (docId -> graded relevance, where any
// value > 0 counts as relevant). They make no assumptions about the search
// engine, so they are trivially unit-testable.

/** Graded relevance judgments for a single query: docId -> grade (>0 = relevant). */
export type Relevance = Map<number, number>;

function countRelevant(relevance: Relevance): number {
  let n = 0;
  for (const grade of relevance.values()) if (grade > 0) n += 1;
  return n;
}

/** Precision@k: fraction of the top-k results that are relevant. */
export function precisionAtK(
  ranked: number[],
  relevance: Relevance,
  k: number,
): number {
  if (k <= 0) return 0;
  const hits = ranked
    .slice(0, k)
    .filter((id) => (relevance.get(id) ?? 0) > 0).length;
  return hits / k;
}

/** Recall@k: fraction of all relevant documents that appear in the top-k. */
export function recallAtK(
  ranked: number[],
  relevance: Relevance,
  k: number,
): number {
  const totalRelevant = countRelevant(relevance);
  if (totalRelevant === 0) return 0;
  const hits = ranked
    .slice(0, k)
    .filter((id) => (relevance.get(id) ?? 0) > 0).length;
  return hits / totalRelevant;
}

/** Reciprocal rank: 1 / (rank of the first relevant result), else 0. */
export function reciprocalRank(ranked: number[], relevance: Relevance): number {
  for (let i = 0; i < ranked.length; i++) {
    if ((relevance.get(ranked[i]) ?? 0) > 0) return 1 / (i + 1);
  }
  return 0;
}

/** Average precision over the full ranked list (binary relevance). */
export function averagePrecision(
  ranked: number[],
  relevance: Relevance,
): number {
  const totalRelevant = countRelevant(relevance);
  if (totalRelevant === 0) return 0;
  let hits = 0;
  let sum = 0;
  for (let i = 0; i < ranked.length; i++) {
    if ((relevance.get(ranked[i]) ?? 0) > 0) {
      hits += 1;
      sum += hits / (i + 1);
    }
  }
  return sum / totalRelevant;
}

function discountedCumulativeGain(grades: number[]): number {
  // Standard DCG with a log2(rank + 1) position discount.
  return grades.reduce((sum, grade, i) => sum + grade / Math.log2(i + 2), 0);
}

/**
 * nDCG@k with graded relevance. The ideal DCG ranks documents by descending
 * relevance grade, so nDCG normalizes to [0, 1] per query regardless of how
 * many relevant documents exist.
 */
export function ndcgAtK(
  ranked: number[],
  relevance: Relevance,
  k: number,
): number {
  const dcg = discountedCumulativeGain(
    ranked.slice(0, k).map((id) => relevance.get(id) ?? 0),
  );
  const idealGrades = [...relevance.values()]
    .filter((grade) => grade > 0)
    .sort((a, b) => b - a)
    .slice(0, k);
  const idcg = discountedCumulativeGain(idealGrades);
  return idcg === 0 ? 0 : dcg / idcg;
}
