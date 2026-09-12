import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { deployForums } from "./helpers/deployForums.js";

/**
 * Creates a production Ignition module that deploys the SymvoliaRegistry
 * (backed by a real on-chain IZKPassportVerifier) and a set of Forum contracts.
 *
 * This single module serves both:
 *   - Base Mainnet deployments (with a production parameter file)
 *   - Local public-network fork deployments (with a dev parameter file)
 *
 * The forum list is a factory argument (not an Ignition parameter) because it
 * determines which Future IDs exist in the deployment graph and must be known
 * at module construction time.
 *
 * Required Ignition parameters (supplied via a parameters JSON file):
 *   - ForumProductionModule.verifierAddress  (string)  — deployed IZKPassportVerifier address
 *   - ForumProductionModule.scope            (string)  — ZKPassport verification scope
 *   - ForumProductionModule.domain           (string)  — expected domain for proofs
 *   - ForumProductionModule.devMode          (boolean) — allow dev proofs (true for testing)
 */
export function createForumProductionModule(
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
  return buildModule("ForumProductionModule", (m) => {
    const verifierAddress = m.getParameter<string>("verifierAddress");
    const scope = m.getParameter<string>("scope");
    const domain = m.getParameter<string>("domain");
    const devMode = m.getParameter<boolean>("devMode");

    const ZKPassportVerifier = m.contractAt(
      "IZKPassportVerifier",
      verifierAddress,
    );

    const registry = m.contract("SymvoliaRegistry", [
      scope,
      domain,
      ZKPassportVerifier,
      devMode,
    ]);

    const { forums } = deployForums(
      m,
      registry,
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

    return { registry, ...forums };
  });
}
