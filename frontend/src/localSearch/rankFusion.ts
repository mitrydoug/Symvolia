import { Statement } from "../types";

// ─── RRF TUNING KNOBS ──────────────────────────────────────────────────────
// These control how the "Similar Statements" list is ordered. The final order
// is a Reciprocal Rank Fusion (RRF) of two rankings over the SAME set of
// similarity-search results:
//   • List S — the semantic/text similarity order (as returned by search).
//   • List R — the same statements re-ranked by total vote count (support).
//
// Tune these three constants to taste:

/**
 * Weight applied to the similarity ranking (list S).
 * Higher → trust the semantic relevance order more.
 */
export const SIMILARITY_WEIGHT = 1.0;

/**
 * Weight applied to the support ranking (list R).
 * Higher → let popular (high-support) statements bubble up more aggressively.
 */
export const SUPPORT_WEIGHT = 0.5;

/**
 * RRF smoothing constant `k`.
 * Smaller `k` → the head of each list dominates, so re-ordering is stronger.
 * Larger `k` (the classic default is 60) → a gentler blend that stays closer
 * to pure similarity order. With only ~50–100 items, a smaller `k` is needed
 * for support to visibly move things.
 */
export const RRF_K = 15;
// ───────────────────────────────────────────────────────────────────────────

/**
 * Merge similarity-search results with vote-count rankings into a single
 * ordered list via weighted Reciprocal Rank Fusion.
 *
 * The output contains exactly the input statements (no additions/removals),
 * re-ordered so that statements which are both semantically similar AND
 * well-supported rise to the top. Statements with negative net support are
 * never fused and are always placed at the bottom, in similarity order.
 *
 * @param statements     The resolved similarity-search results.
 * @param relevanceOrder Map of statementId → similarity rank (0 = most similar).
 */
export function fuseSimilarStatements(
  statements: Statement[],
  relevanceOrder: Map<number, number>,
): Statement[] {
  if (statements.length === 0) return [];

  // List S: similarity rank for every statement (0 = most similar). Anything
  // missing from the search hits sorts to the end.
  const simRank = new Map<number, number>();
  [...statements]
    .sort((a, b) => {
      const ai = relevanceOrder.get(Number(a.id)) ?? Number.MAX_SAFE_INTEGER;
      const bi = relevanceOrder.get(Number(b.id)) ?? Number.MAX_SAFE_INTEGER;
      return ai - bi;
    })
    .forEach((s, i) => simRank.set(Number(s.id), i));

  const simRankOf = (s: Statement) => simRank.get(Number(s.id)) ?? 0;

  // Statements with negative net support are kept strictly at the bottom and
  // never participate in fusion.
  const supported = statements.filter((s) => s.support >= 0n);
  const opposed = statements.filter((s) => s.support < 0n);

  // List R: the supported statements re-ranked by total vote count (desc),
  // tie-broken by similarity so equal-support items keep relevance order.
  const supportRank = new Map<number, number>();
  [...supported]
    .sort((a, b) => {
      if (a.support !== b.support) return a.support > b.support ? -1 : 1;
      return simRankOf(a) - simRankOf(b);
    })
    .forEach((s, i) => supportRank.set(Number(s.id), i));

  const rrfScore = (s: Statement): number => {
    const sRank = simRankOf(s);
    const rRank = supportRank.get(Number(s.id));
    const simTerm = SIMILARITY_WEIGHT / (RRF_K + sRank);
    const supTerm = rRank === undefined ? 0 : SUPPORT_WEIGHT / (RRF_K + rRank);
    return simTerm + supTerm;
  };

  const fused = [...supported].sort((a, b) => {
    const diff = rrfScore(b) - rrfScore(a);
    if (diff !== 0) return diff;
    // Stable tie-break: preserve similarity order.
    return simRankOf(a) - simRankOf(b);
  });

  const opposedSorted = [...opposed].sort(
    (a, b) => simRankOf(a) - simRankOf(b),
  );

  return [...fused, ...opposedSorted];
}
