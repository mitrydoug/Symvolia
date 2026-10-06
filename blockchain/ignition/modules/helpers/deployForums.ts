import type { IgnitionModuleBuilder } from "@nomicfoundation/ignition-core";
import type {
  ContractFuture,
  NamedArtifactContractDeploymentFuture,
} from "@nomicfoundation/ignition-core";

/**
 * Shared helper that deploys a set of Forum contracts pointing at the given registry.
 *
 * @param m                          - The Ignition module builder.
 * @param registry                   - A Future resolving to the SymvoliaRegistry (or mock) contract.
 * @param forumNames                 - The list of forum identifiers to deploy (e.g. ["global", "USA"]).
 *                                     "global" is special-cased to pass an empty nationality string.
 * @param creditAllowanceIntervalSeconds - Duration (in seconds) of a single credit allowance interval.
 * @param engagementWindowSeconds    - Minimum seconds between StatementEngaged events per statement.
 * @param maxRankedStatements        - Maximum number of ranked statements per forum.
 * @param minStatementSupportToRank  - Minimum support value for a statement to enter rankings.
 * @param maxStatementLength         - Maximum byte length of a statement.
 * @param userCreditAllowancePerInterval - Credits granted per interval.
 * @param userStartingCredits        - Credits for newly registered users.
 * @param minAdjustmentIntervalSeconds - Minimum seconds between support adjustments per user+statement.
 * @param creditMultiplier            - Credit multiplier (e.g. 10^6 for microcredits).
 * @param refundPenaltyBps            - Refund penalty in basis points (e.g. 2000 = 20%).
 * @param decaySpeedupFactor          - Multiplier to accelerate decay for testing (1 = normal).
 * @param statementBurstCapacity      - Max statements a user can create in a burst (token-bucket capacity).
 * @param statementRefillIntervalSeconds - Seconds to regain one statement-creation token.
 * @returns A record mapping each forum name to its deployed Forum contract Future.
 */
export function deployForums(
  m: IgnitionModuleBuilder,
  registry: ContractFuture<string>,
  forumNames: string[],
  creditAllowanceIntervalSeconds: number,
  engagementWindowSeconds: number,
  maxRankedStatements: number,
  minStatementSupportToRank: number,
  maxStatementLength: number,
  userCreditAllowancePerInterval: number,
  userStartingCredits: number,
  minAdjustmentIntervalSeconds: number,
  creditMultiplier: number,
  refundPenaltyBps: number,
  decaySpeedupFactor: number,
  statementBurstCapacity: number,
  statementRefillIntervalSeconds: number,
): {
  forums: Record<string, NamedArtifactContractDeploymentFuture<"Forum">>;
} {
  const forums = Object.fromEntries(
    forumNames.map((forum) => [
      forum,
      m.contract(
        "Forum",
        [
          registry,
          forum === "global" ? "" : forum,
          {
            maxRankedStatements,
            creditAllowanceIntervalSeconds,
            engagementWindowSeconds,
            maxStatementLength,
            userCreditAllowancePerInterval,
            userStartingCredits,
            minStatementSupportToRank,
            minAdjustmentIntervalSeconds,
            creditMultiplier,
            refundPenaltyBps,
            decaySpeedupFactor,
            statementBurstCapacity,
            statementRefillIntervalSeconds,
          },
        ],
        { id: `Forum_${forum}` },
      ),
    ]),
  );

  return { forums };
}
