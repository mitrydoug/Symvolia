/// <reference types="node" />

import hre from "hardhat";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Address, PublicClient } from "viem";
import {
  getDeploymentConfig,
  requireDeploymentProfile,
} from "../ignition/config/deployments.js";

/**
 * Deploy only forums that are present in the desired deployment profile but
 * missing from deployments/<network>.json. Existing registry and forum
 * addresses are verified and preserved.
 *
 * Usage:
 *   DEPLOYMENT_PROFILE=base-sepolia npx hardhat run scripts/reconcile-forums.ts --network base_sepolia
 */

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const scriptDir = path.dirname(fileURLToPath(import.meta.url));

type DeploymentArtifact = {
  schemaVersion: 1;
  network: string;
  deployNetwork: string;
  deploymentProfile: string;
  chainId: number;
  registryMode: "dev" | "mock" | "production";
  registryAddress: Address;
  forumOrder: string[];
  forums: Record<string, Address>;
  deploymentBlockNumber: number;
  forumDeploymentBlockNumbers?: Record<string, number>;
  updatedAt?: string;
};

const writesLocalDeploymentArtifact = (networkName: string) =>
  networkName === "default" ||
  networkName === "local_base_sepolia_fork" ||
  networkName.startsWith("localhost");

const hexQuantityToNumber = (value: string) => Number(BigInt(value));

const readDeploymentArtifact = (deploymentPath: string): DeploymentArtifact => {
  let deployment: DeploymentArtifact;
  try {
    deployment = JSON.parse(
      readFileSync(deploymentPath, "utf8"),
    ) as DeploymentArtifact;
  } catch (error) {
    throw new Error(
      `Missing or invalid deployment artifact at ${deploymentPath}. ` +
      "Run the initial full deployment first.",
    );
  }

  if (deployment.schemaVersion !== 1) {
    throw new Error(
      `Unsupported deployment schemaVersion ${deployment.schemaVersion}`,
    );
  }
  if (!ADDRESS_PATTERN.test(deployment.registryAddress)) {
    throw new Error("deployment.registryAddress must be a 20-byte hex address");
  }
  if (!deployment.forums || typeof deployment.forums !== "object") {
    throw new Error("deployment.forums must be set");
  }

  return deployment;
};

const requireCode = async (
  publicClient: PublicClient,
  address: Address,
  label: string,
) => {
  const code = await publicClient.getCode({ address });
  if (!code || code === "0x") {
    throw new Error(`${label} has no bytecode at ${address}`);
  }
};

async function main() {
  const connection = await hre.network.connect();
  const { networkName } = connection;
  const deploymentProfile = requireDeploymentProfile(
    process.env.DEPLOYMENT_PROFILE,
  );
  const config = getDeploymentConfig(deploymentProfile);

  const deploymentName = writesLocalDeploymentArtifact(networkName)
    ? "localhost"
    : networkName;
  const deploymentPath = path.resolve(
    scriptDir,
    "../../deployments",
    `${deploymentName}.json`,
  );
  const deployment = readDeploymentArtifact(deploymentPath);

  if (deployment.deployNetwork !== networkName) {
    throw new Error(
      `Deployment artifact deployNetwork=${deployment.deployNetwork} does not match ` +
      `current network=${networkName}`,
    );
  }
  if (deployment.deploymentProfile !== deploymentProfile) {
    throw new Error(
      `Deployment artifact profile=${deployment.deploymentProfile} does not match ` +
      `DEPLOYMENT_PROFILE=${deploymentProfile}`,
    );
  }
  if (deployment.registryMode !== config.mode) {
    throw new Error(
      `Deployment artifact registryMode=${deployment.registryMode} does not match ` +
      `profile mode=${config.mode}`,
    );
  }

  const publicClient = await connection.viem.getPublicClient();
  await requireCode(
    publicClient,
    deployment.registryAddress,
    "Existing registry",
  );

  const configuredForumNames = new Set(config.forums);
  const artifactOnlyForumNames = Object.keys(deployment.forums).filter(
    (forumName) => !configuredForumNames.has(forumName),
  );
  if (artifactOnlyForumNames.length > 0) {
    throw new Error(
      "Deployment artifact contains forums that are not in the desired config: " +
      `${artifactOnlyForumNames.join(", ")}. ` +
      "Forum removal is potentially destructive and is not handled by reconciliation.",
    );
  }

  for (const forumName of config.forums) {
    const existingAddress = deployment.forums[forumName];
    if (!existingAddress) continue;
    await requireCode(
      publicClient,
      existingAddress,
      `Existing Forum (${forumName})`,
    );
  }

  const missingForumNames = config.forums.filter(
    (forumName) => !deployment.forums[forumName],
  );

  if (missingForumNames.length === 0) {
    console.log(
      `Deployment artifact ${deploymentPath} already contains all configured forums: ` +
      config.forums.join(", "),
    );
    return;
  }

  console.log(
    `Reconciling missing forums for profile "${deploymentProfile}" on network "${networkName}"...`,
  );
  console.log(`Existing registry: ${deployment.registryAddress}`);
  console.log(`Missing forums: ${missingForumNames.join(", ")}`);

  const forumDeploymentBlockNumbers = {
    ...(deployment.forumDeploymentBlockNumbers ?? {}),
  };
  for (const forumName of deployment.forumOrder ?? []) {
    if (
      deployment.forums[forumName] &&
      !forumDeploymentBlockNumbers[forumName]
    ) {
      forumDeploymentBlockNumbers[forumName] = deployment.deploymentBlockNumber;
    }
  }

  for (const forumName of missingForumNames) {
    const forum = await connection.viem.deployContract("Forum", [
      deployment.registryAddress,
      forumName === "global" ? "" : forumName,
      {
        maxRankedStatements: BigInt(config.maxRankedStatements),
        creditAllowanceIntervalSeconds: BigInt(
          config.creditAllowanceIntervalSeconds,
        ),
        engagementWindowSeconds: BigInt(config.engagementWindowSeconds),
        maxStatementLength: BigInt(config.maxStatementLength),
        userCreditAllowancePerInterval: BigInt(
          config.userCreditAllowancePerInterval,
        ),
        userStartingCredits: BigInt(config.userStartingCredits),
        minStatementSupportToRank: BigInt(config.minStatementSupportToRank),
        minAdjustmentIntervalSeconds: BigInt(
          config.minAdjustmentIntervalSeconds,
        ),
        creditMultiplier: BigInt(config.creditMultiplier),
        refundPenaltyBps: BigInt(config.refundPenaltyBps),
        decaySpeedupFactor: BigInt(config.decaySpeedupFactor),
        statementBurstCapacity: BigInt(config.statementBurstCapacity),
        statementRefillIntervalSeconds: BigInt(
          config.statementRefillIntervalSeconds,
        ),
      },
    ]);

    const blockNumber = hexQuantityToNumber(
      (await connection.provider.request({
        method: "eth_blockNumber",
      })) as string,
    );
    deployment.forums[forumName] = forum.address;
    forumDeploymentBlockNumbers[forumName] = blockNumber;
    console.log(`Deployed Forum (${forumName}) at: ${forum.address}`);
  }

  const forumOrder = [
    ...deployment.forumOrder.filter(
      (forumName) => deployment.forums[forumName],
    ),
    ...config.forums.filter(
      (forumName) => !deployment.forumOrder.includes(forumName),
    ),
  ];

  const updatedDeployment: DeploymentArtifact = {
    ...deployment,
    forumOrder,
    forums: Object.fromEntries(
      forumOrder.map((forumName) => [forumName, deployment.forums[forumName]]),
    ) as Record<string, Address>,
    forumDeploymentBlockNumbers,
    updatedAt: new Date().toISOString(),
  };

  mkdirSync(path.dirname(deploymentPath), { recursive: true });
  writeFileSync(
    deploymentPath,
    `${JSON.stringify(updatedDeployment, null, 2)}\n`,
  );
  console.log(`Updated deployment artifact at ${deploymentPath}`);
  console.log(
    "Registry and existing forums were preserved. Only missing forums were deployed.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
