import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { deployForums } from "./helpers/deployForums.js";

/**
 * Creates a mock Ignition module that deploys a MockSymvoliaRegistry and a set
 * of Forum contracts.
 *
 * MockSymvoliaRegistry follows the same registration flow as the production
 * SymvoliaRegistry (users generate a real ZKPassport proof client-side) but
 * recovers the unique identifier and disclosed nationality by disassembling the
 * proof parameters instead of calling an on-chain verifier. This is used on
 * networks where ZKPassport has not deployed its verifier contract (e.g. Base
 * Sepolia). It provides no cryptographic guarantees and must never be used in
 * production.
 *
 * Unlike the production module, scope/devMode are factory arguments
 * (baked into the module) rather than Ignition parameters, since no external
 * verifier address is required. The service scope (domain) is not enforced by
 * the mock registry, so it is not a constructor argument.
 */
export function createForumMockModule(
  forumNames: string[],
  scope: string,
  devMode: boolean,
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
  return buildModule("ForumMockRegistryModule", (m) => {
    const mockZKRegistry = m.contract("MockSymvoliaRegistry", [scope, devMode]);

    const { forums } = deployForums(
      m,
      mockZKRegistry,
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

    return { registry: mockZKRegistry, ...forums };
  });
}
