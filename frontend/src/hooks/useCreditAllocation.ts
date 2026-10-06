import { useMemo } from "react";
import { SupportAdjustmentType, useUserVotes } from "../state/UserVotes";
import { useForum } from "../state/Forum";
import { partsToCredits } from "../util";

/** Quadratic cost for a given support level in credit parts (matches on-chain formula). */
const creditCost = (support: number, creditMultiplier: number): number => {
  const abs = Math.abs(support);
  return (abs * (abs + creditMultiplier)) / (2 * creditMultiplier);
};

export type StagedDirection = "increase" | "decrease" | "none";

export interface CreditAllocation {
  /** Credits that stay committed on-chain regardless of pending changes */
  allocated: number;
  /** Magnitude of the net pending change (0 when increases and decreases cancel) */
  staged: number;
  /** Credits that stay available regardless of pending changes */
  unallocated: number;
  /** Total credits the user has */
  total: number;
  /**
   * Direction of the net pending change:
   * - "increase": net credits will move from unallocated into allocated
   * - "decrease": net credits will move from allocated back to unallocated
   * - "none": no net change staged
   */
  stagedDirection: StagedDirection;
}

/**
 * Computes the breakdown of a verified user's credit allocation
 * into allocated (committed), staged (pending), and unallocated segments.
 *
 * Returns null when the user is not verified or data is unavailable.
 */
export const useCreditAllocation = (): CreditAllocation | null => {
  const userVotes = useUserVotes();
  const { creditMultiplier } = useForum();

  return useMemo(() => {
    if (
      !userVotes.isUserVerified ||
      !userVotes.state.onChain ||
      !userVotes.state.staged
    ) {
      return null;
    }

    const { onChain, staged } = userVotes.state;

    // Total on-chain cost (committed credits)
    let totalOnChainCost = 0;
    for (const [, support] of onChain.statementSupport) {
      totalOnChainCost += creditCost(support, creditMultiplier);
    }

    // Pending adjustment impact
    let totalDecreaseCost = 0;
    let totalIncreaseCost = 0;

    for (const [statementId, adjustment] of staged.supportAdjustments) {
      const onChainSupport = onChain.statementSupport.get(statementId) || 0;
      const effectiveSupport =
        adjustment.adjustmentType === SupportAdjustmentType.SetTo
          ? adjustment.value
          : onChainSupport + adjustment.value;

      const onChainC = creditCost(onChainSupport, creditMultiplier);
      const effectiveC = creditCost(effectiveSupport, creditMultiplier);
      const costChange = effectiveC - onChainC;

      if (costChange < 0) {
        totalDecreaseCost += -costChange;
      } else if (costChange > 0) {
        totalIncreaseCost += costChange;
      }
    }

    // Include cost for staged new statements
    for (const stmt of staged.stagedStatements) {
      if (stmt.initialSupport !== 0) {
        totalIncreaseCost += creditCost(stmt.initialSupport, creditMultiplier);
      }
    }

    // Include cost of the in-progress draft (before it is staged)
    const draftCost = userVotes.state.pendingDraftCost;
    totalIncreaseCost += draftCost;

    // Net pending change: positive means allocation grows (credits leave the
    // unallocated pool), negative means allocation shrinks (credits return to it).
    const net = totalIncreaseCost - totalDecreaseCost;

    let allocated: number;
    let stagedAmount: number;
    let unallocated: number;

    if (net >= 0) {
      // Firmly-allocated stays put; the net increase transitions out of unallocated.
      allocated = totalOnChainCost;
      stagedAmount = net;
      unallocated = onChain.credits - net;
    } else {
      // Firmly-unallocated stays put; the net decrease transitions out of allocated.
      allocated = totalOnChainCost + net;
      stagedAmount = -net;
      unallocated = onChain.credits;
    }

    const total = allocated + stagedAmount + unallocated;
    const stagedDirection: StagedDirection =
      net > 0 ? "increase" : net < 0 ? "decrease" : "none";

    return {
      allocated: partsToCredits(allocated, creditMultiplier),
      staged: partsToCredits(stagedAmount, creditMultiplier),
      unallocated: partsToCredits(unallocated, creditMultiplier),
      total: partsToCredits(total, creditMultiplier),
      stagedDirection,
    };
  }, [userVotes, creditMultiplier]);
};
