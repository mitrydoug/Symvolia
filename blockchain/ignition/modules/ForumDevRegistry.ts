import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { deployForums } from "./helpers/deployForums.js";

/**
 * Creates a dev Ignition module that deploys a DevSymvoliaRegistry
 * (allowing instant address-derived registration) and a set of Forum
 * contracts. Used for fast local iteration where a Hardhat signer can
 * self-register without a ZKPassport proof.
 */
export function createForumDevModule(
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
) {
  return buildModule("ForumDevRegistryModule", (m) => {
    const devZKRegistry = m.contract("DevSymvoliaRegistry");

    const { forums } = deployForums(
      m,
      devZKRegistry,
      forumNames,
      creditAllowanceIntervalSeconds,
      engagementWindowSeconds,
      maxRankedStatements,
      minStatementSupportToRank,
      maxStatementLength,
      userCreditAllowancePerInterval,
      userStartingCredits,
      minAdjustmentIntervalSeconds,
      creditMultiplier,
      refundPenaltyBps,
      decaySpeedupFactor,
      statementBurstCapacity,
      statementRefillIntervalSeconds,
    );

    return { registry: devZKRegistry, ...forums };
  });
}
