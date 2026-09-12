/**
 * Deployment configuration per deployment profile.
 *
 * Maps each deployment profile to the Ignition module mode and forum list
 * to deploy. For "production" mode, a parameters file path (relative
 * to ignition/parameters/) supplies the module's runtime parameters.
 */

type DevDeploymentConfig = {
  mode: "dev";
  forums: string[];
  creditAllowanceIntervalSeconds: number;
  engagementWindowSeconds: number;
  maxRankedStatements: number;
  minStatementSupportToRank: number;
  maxStatementLength: number;
  userCreditAllowancePerInterval: number;
  userStartingCredits: number;
  minAdjustmentIntervalSeconds: number;
  creditMultiplier: number;
  refundPenaltyBps: number;
  decaySpeedupFactor: number;
  statementBurstCapacity: number;
  statementRefillIntervalSeconds: number;
};

type MockDeploymentConfig = {
  mode: "mock";
  /** ZKPassport subscope committed into the proof (the app scope). */
  scope: string;
  /** Allow dev/mock ZKPassport proofs (true for testnets). */
  devMode: boolean;
  forums: string[];
  creditAllowanceIntervalSeconds: number;
  engagementWindowSeconds: number;
  maxRankedStatements: number;
  minStatementSupportToRank: number;
  maxStatementLength: number;
  userCreditAllowancePerInterval: number;
  userStartingCredits: number;
  minAdjustmentIntervalSeconds: number;
  creditMultiplier: number;
  refundPenaltyBps: number;
  decaySpeedupFactor: number;
  statementBurstCapacity: number;
  statementRefillIntervalSeconds: number;
};

type ProductionDeploymentConfig = {
  mode: "production";
  forums: string[];
  creditAllowanceIntervalSeconds: number;
  engagementWindowSeconds: number;
  maxRankedStatements: number;
  minStatementSupportToRank: number;
  maxStatementLength: number;
  userCreditAllowancePerInterval: number;
  userStartingCredits: number;
  minAdjustmentIntervalSeconds: number;
  creditMultiplier: number;
  refundPenaltyBps: number;
  decaySpeedupFactor: number;
  statementBurstCapacity: number;
  statementRefillIntervalSeconds: number;
  parametersFile: string;
};

export type DeploymentConfig =
  | DevDeploymentConfig
  | MockDeploymentConfig
  | ProductionDeploymentConfig;

/** 1 credit = 10^6 microcredits. All credit values use this unit on-chain. */
export const CRED_MULT = 1_000_000;

const deploymentConfigs: Record<string, DeploymentConfig> = {
  /** Local native Hardhat node with mock data. */
  "local-dev": {
    mode: "dev",
    forums: ["global", "USA", "CAN"],
    creditAllowanceIntervalSeconds: 60,
    engagementWindowSeconds: 300,
    maxRankedStatements: 10,
    minStatementSupportToRank: 3 * CRED_MULT,
    maxStatementLength: 120,
    userCreditAllowancePerInterval: 25 * CRED_MULT,
    userStartingCredits: 1000 * CRED_MULT,
    minAdjustmentIntervalSeconds: 12,
    creditMultiplier: CRED_MULT,
    refundPenaltyBps: 2000,
    decaySpeedupFactor: 2016,
    statementBurstCapacity: 1000,
    statementRefillIntervalSeconds: 60,
  },

  /** Local native Hardhat node with mock registry and larger stress-test limits. */
  "local-stress-test": {
    mode: "dev",
    forums: ["global", "USA", "CAN"],
    creditAllowanceIntervalSeconds: 60,
    engagementWindowSeconds: 300,
    maxRankedStatements: 100,
    minStatementSupportToRank: 3 * CRED_MULT,
    maxStatementLength: 280,
    userCreditAllowancePerInterval: 25 * CRED_MULT,
    userStartingCredits: 1000 * CRED_MULT,
    minAdjustmentIntervalSeconds: 12,
    creditMultiplier: CRED_MULT,
    refundPenaltyBps: 2000,
    decaySpeedupFactor: 168,
    statementBurstCapacity: 100000,
    statementRefillIntervalSeconds: 60,
  },

  /** Local Base Sepolia fork using the same mocked-registry topology as Base Sepolia. */
  "local-base-sepolia-fork": {
    mode: "dev",
    forums: ["global", "USA", "CAN"],
    creditAllowanceIntervalSeconds: 60,
    engagementWindowSeconds: 300,
    maxRankedStatements: 10,
    minStatementSupportToRank: 3 * CRED_MULT,
    maxStatementLength: 120,
    userCreditAllowancePerInterval: 25 * CRED_MULT,
    userStartingCredits: 1000 * CRED_MULT,
    minAdjustmentIntervalSeconds: 12,
    creditMultiplier: CRED_MULT,
    refundPenaltyBps: 2000,
    decaySpeedupFactor: 2016,
    statementBurstCapacity: 1000,
    statementRefillIntervalSeconds: 60,
  },

  /** Base mainnet production deployment. */
  base: {
    mode: "production",
    forums: ["global", "USA", "CAN"],
    creditAllowanceIntervalSeconds: 14400,
    engagementWindowSeconds: 86400,
    maxRankedStatements: 1000,
    minStatementSupportToRank: 10 * CRED_MULT,
    maxStatementLength: 120,
    userCreditAllowancePerInterval: 25 * CRED_MULT,
    userStartingCredits: 1000 * CRED_MULT,
    minAdjustmentIntervalSeconds: 12,
    creditMultiplier: CRED_MULT,
    refundPenaltyBps: 2000,
    decaySpeedupFactor: 1,
    statementBurstCapacity: 5,
    statementRefillIntervalSeconds: 14400,
    parametersFile: "base.json",
  },

  /**
   * Base Sepolia testnet deployment (test.symvolia.org). Runs the proof-parsing
   * mock registry: the full zkPassport proof flow without an on-chain verifier
   * (zkPassport has not deployed its verifier to Base Sepolia). The service
   * scope (domain) is not enforced, so the same deployment accepts proofs
   * generated from any host (e.g. test.symvolia.org or 127.0.0.1).
   */
  "base-sepolia": {
    mode: "mock",
    scope: "symvolia-verify",
    devMode: true,
    forums: ["global", "USA", "CAN"],
    creditAllowanceIntervalSeconds: 14400,
    engagementWindowSeconds: 86400,
    maxRankedStatements: 1000,
    minStatementSupportToRank: 10 * CRED_MULT,
    maxStatementLength: 120,
    userCreditAllowancePerInterval: 25 * CRED_MULT,
    userStartingCredits: 1000 * CRED_MULT,
    minAdjustmentIntervalSeconds: 12,
    creditMultiplier: CRED_MULT,
    refundPenaltyBps: 2000,
    decaySpeedupFactor: 1,
    statementBurstCapacity: 5,
    statementRefillIntervalSeconds: 14400,
  },

  /** Local native Hardhat node exercising the proof-parsing mock registry. */
  "local-mocked": {
    mode: "mock",
    scope: "symvolia-verify",
    devMode: true,
    forums: ["global", "USA", "CAN"],
    creditAllowanceIntervalSeconds: 60,
    engagementWindowSeconds: 300,
    maxRankedStatements: 10,
    minStatementSupportToRank: 3 * CRED_MULT,
    maxStatementLength: 120,
    userCreditAllowancePerInterval: 25 * CRED_MULT,
    userStartingCredits: 1000 * CRED_MULT,
    minAdjustmentIntervalSeconds: 12,
    creditMultiplier: CRED_MULT,
    refundPenaltyBps: 2000,
    decaySpeedupFactor: 2016,
    statementBurstCapacity: 1000,
    statementRefillIntervalSeconds: 60,
  },
};

export function getDeploymentConfig(profileName: string): DeploymentConfig {
  const config = deploymentConfigs[profileName];
  if (!config) {
    throw new Error(
      `No deployment config for profile "${profileName}". ` +
      `Known profiles: ${Object.keys(deploymentConfigs).join(", ")}`,
    );
  }
  return config;
}

export function requireDeploymentProfile(
  profileName: string | undefined,
): string {
  if (!profileName) {
    throw new Error(
      "DEPLOYMENT_PROFILE must be set explicitly. " +
      `Known profiles: ${Object.keys(deploymentConfigs).join(", ")}`,
    );
  }

  return profileName;
}
