import { useReadContract } from "wagmi";

import { FORUM_ABI } from "../contracts";
import { useForum } from "../state/Forum";
import { useUserVotes } from "../state/UserVotes";
import { useWalletAuth } from "@/wallet";

export interface StatementAllowance {
  /**
   * On-chain statement tokens available right now (the token bucket's
   * `available`), or `null` while the allowance read is loading / disabled.
   */
  available: number | null;
  /**
   * Unix timestamp (seconds) when the next statement token frees up, or `0`
   * when the bucket is already full.
   */
  nextRefillTimestamp: number;
  /**
   * Statements staged in the current batch that have not yet been committed.
   * These have not consumed their on-chain token (that happens on commit), so
   * they count against the remaining allowance client-side.
   */
  staged: number;
  /**
   * `available` minus `staged`, floored at 0, or `null` while the allowance
   * read is loading.
   */
  remaining: number | null;
  /**
   * Whether the user has staged more statements than the bucket currently
   * permits — a batch that would revert on-chain if submitted as-is.
   */
  isOverStaged: boolean;
  /**
   * How many staged statements exceed the current allowance (0 unless
   * `isOverStaged`).
   */
  overStagedBy: number;
}

/**
 * Reads the caller's per-identity statement-creation allowance (token bucket
 * enforced on-chain by `Forum.addStatement`) and reconciles it against the
 * statements already staged in the current batch. Shared by the create-statement
 * page, the submit confirmation dialog, and the credits action panel so they all
 * present a consistent view of how many statements the user may still submit.
 */
const useStatementAllowance = (): StatementAllowance => {
  const { address } = useWalletAuth();
  const { isUserVerified, state } = useUserVotes();
  const { forumContractAddress } = useForum();

  const { data } = useReadContract({
    address: forumContractAddress,
    abi: FORUM_ABI,
    account: address,
    functionName: "getStatementAllowance",
    args: [],
    query: {
      enabled: Boolean(address && isUserVerified),
    },
  });

  const available = data ? Number(data[0]) : null;
  const nextRefillTimestamp = data ? Number(data[1]) : 0;
  const staged = state?.staged?.stagedStatements.length ?? 0;

  const remaining = available === null ? null : Math.max(0, available - staged);
  const isOverStaged = available !== null && staged > available;
  const overStagedBy =
    isOverStaged && available !== null ? staged - available : 0;

  return {
    available,
    nextRefillTimestamp,
    staged,
    remaining,
    isOverStaged,
    overStagedBy,
  };
};

export default useStatementAllowance;
