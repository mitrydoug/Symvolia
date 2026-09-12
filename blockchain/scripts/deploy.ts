import hre from "hardhat";
import path from "path";
import { mkdirSync, writeFileSync } from "fs";
import { createForumProductionModule } from "../ignition/modules/ForumProduction.js";
import { createForumDevModule } from "../ignition/modules/ForumDevRegistry.js";
import { createForumMockModule } from "../ignition/modules/ForumMockRegistry.js";
import {
  getDeploymentConfig,
  requireDeploymentProfile,
} from "../ignition/config/deployments.js";

/** Minimal contract shape we need for post-deploy output generation. */
type DeployedContract = { address: string; abi: unknown[] };

const writesLocalDeploymentArtifact = (networkName: string) =>
  networkName === "default" ||
  networkName === "local_base_sepolia_fork" ||
  networkName.startsWith("localhost");

const supportsNetworkHelpers = (networkName: string) =>
  networkName === "default" || networkName === "local_base_sepolia_fork";

const hexQuantityToNumber = (value: string) => Number(BigInt(value));

async function main() {
  const connection = await hre.network.connect();
  const { networkName, ignition } = connection;
  const deploymentProfile = requireDeploymentProfile(
    process.env.DEPLOYMENT_PROFILE,
  );
  const config = getDeploymentConfig(deploymentProfile);

  console.log(
    `Deploying profile "${deploymentProfile}" to network "${networkName}" in "${config.mode}" mode…`,
  );
  console.log(`Forums: ${config.forums.join(", ")}`);

  let registry: DeployedContract;
  let forums: Record<string, DeployedContract>;

  // Simulated networks only: advance block timestamp to real time so that
  // time-dependent contract logic (e.g. ZKPassport proof validity windows)
  // behaves realistically during development. Forked networks inherit the
  // timestamp of the pinned block, which can be far in the past.
  if (supportsNetworkHelpers(networkName) && "networkHelpers" in connection) {
    const { networkHelpers } = connection;
    const currentTimestamp = await networkHelpers.time.latest();
    const targetTimestamp = Math.floor(Date.now() / 1000) + 1;

    if (currentTimestamp < targetTimestamp) {
      await networkHelpers.time.increaseTo(targetTimestamp);
    }
  }

  if (config.mode === "dev") {
    const module = createForumDevModule(
      config.forums,
      config.creditAllowanceIntervalSeconds,
      config.engagementWindowSeconds,
      config.maxRankedStatements,
      config.minStatementSupportToRank,
      config.maxStatementLength,
      config.userCreditAllowancePerInterval,
      config.userStartingCredits,
      config.minAdjustmentIntervalSeconds,
      config.creditMultiplier,
      config.refundPenaltyBps,
      config.decaySpeedupFactor,
      config.statementBurstCapacity,
      config.statementRefillIntervalSeconds,
    );
    const deployResult = await ignition.deploy(module);
    ({ registry, ...forums } = deployResult);
  } else if (config.mode === "mock") {
    const module = createForumMockModule(
      config.forums,
      config.scope,
      config.devMode,
      config.creditAllowanceIntervalSeconds,
      config.engagementWindowSeconds,
      config.maxRankedStatements,
      config.minStatementSupportToRank,
      config.maxStatementLength,
      config.userCreditAllowancePerInterval,
      config.userStartingCredits,
      config.minAdjustmentIntervalSeconds,
      config.creditMultiplier,
      config.refundPenaltyBps,
      config.decaySpeedupFactor,
      config.statementBurstCapacity,
      config.statementRefillIntervalSeconds,
    );
    const deployResult = await ignition.deploy(module);
    ({ registry, ...forums } = deployResult);
  } else {
    const module = createForumProductionModule(
      config.forums,
      config.creditAllowanceIntervalSeconds,
      config.engagementWindowSeconds,
      config.maxRankedStatements,
      config.minStatementSupportToRank,
      config.maxStatementLength,
      config.userCreditAllowancePerInterval,
      config.userStartingCredits,
      config.minAdjustmentIntervalSeconds,
      config.creditMultiplier,
      config.refundPenaltyBps,
      config.decaySpeedupFactor,
      config.statementBurstCapacity,
      config.statementRefillIntervalSeconds,
    );
    const parametersPath = path.resolve(
      import.meta.dirname,
      "../ignition/parameters",
      config.parametersFile,
    );
    const deployResult = await ignition.deploy(module, {
      parameters: parametersPath,
    });
    ({ registry, ...forums } = deployResult);
  }

  console.log("Deployed SymvoliaRegistry at:", registry.address);
  for (const [name, contract] of Object.entries(forums)) {
    console.log(`Deployed Forum (${name}) at:`, contract.address);
  }

  const forumAddresses = Object.fromEntries(
    Object.entries(forums).map(([name, contract]) => [name, contract.address]),
  );
  for (const forumName of config.forums) {
    const contract = forums[forumName];
    if (!contract) {
      throw new Error(`Missing deployed Forum contract for ${forumName}`);
    }
  }

  // Local development networks share the localhost deployment artifact;
  // public networks use their actual Hardhat network name.
  const isLocalDeployment = writesLocalDeploymentArtifact(networkName);
  const deploymentName = isLocalDeployment ? "localhost" : networkName;

  const chainId = hexQuantityToNumber(
    (await connection.provider.request({ method: "eth_chainId" })) as string,
  );
  const blockNumber = hexQuantityToNumber(
    (await connection.provider.request({
      method: "eth_blockNumber",
    })) as string,
  );

  const deploymentsDir = path.resolve(import.meta.dirname, "../../deployments");
  mkdirSync(deploymentsDir, { recursive: true });

  const deploymentJson = {
    schemaVersion: 1,
    network: deploymentName,
    deployNetwork: networkName,
    deploymentProfile,
    chainId,
    registryMode: config.mode,
    registryAddress: registry.address,
    forumOrder: config.forums,
    forums: forumAddresses,
    deploymentBlockNumber: blockNumber,
    updatedAt: new Date().toISOString(),
  };

  const deploymentPath = path.join(deploymentsDir, `${deploymentName}.json`);
  writeFileSync(deploymentPath, `${JSON.stringify(deploymentJson, null, 2)}\n`);
  console.log(`Wrote shared deployment artifact to ${deploymentPath}`);

  // Switch from automine to interval mining for development networks.
  // Automine is used during deployment for speed; interval mining (12s)
  // simulates realistic block production for manual interaction afterward.
  if (isLocalDeployment) {
    const { provider } = connection;
    await provider.request({ method: "evm_setAutomine", params: [false] });
    await provider.request({
      method: "evm_setIntervalMining",
      params: [12000],
    });
    console.log("Switched to interval mining (12s blocks).");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
