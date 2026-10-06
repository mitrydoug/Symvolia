import hre from "hardhat";
import path from "path";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { createHash } from "crypto";
import { createForumProductionModule } from "../ignition/modules/ForumProduction.js";
import { createForumDevModule } from "../ignition/modules/ForumDevRegistry.js";
import { createForumMockModule } from "../ignition/modules/ForumMockRegistry.js";
import {
  assertRegistryModeAllowedOnChain,
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

/**
 * Fingerprint the compiled, deployable contract artifacts (ABI + bytecode).
 *
 * Test contracts (`*.t.sol`) are excluded because they never reach chain. The
 * resulting hash is recorded in the deployment artifact so a later deploy can
 * detect when the contracts have changed and clear stale Ignition journal state.
 */
const computeDeployableArtifactFingerprint = (): string => {
  const contractsArtifactsDir = path.resolve(
    import.meta.dirname,
    "../artifacts/contracts",
  );
  const artifactFiles: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.endsWith(".t.sol")) continue; // skip test contracts
        walk(entryPath);
      } else if (
        entry.name.endsWith(".json") &&
        !entry.name.endsWith(".dbg.json")
      ) {
        artifactFiles.push(entryPath);
      }
    }
  };
  walk(contractsArtifactsDir);
  artifactFiles.sort();

  const hash = createHash("sha256");
  for (const file of artifactFiles) {
    const artifact = JSON.parse(readFileSync(file, "utf8"));
    hash.update(path.relative(contractsArtifactsDir, file));
    hash.update("\0");
    hash.update(JSON.stringify(artifact.abi ?? []));
    hash.update("\0");
    hash.update(artifact.bytecode ?? "");
    hash.update("\0");
  }
  return hash.digest("hex");
};

async function main() {
  const connection = await hre.network.connect();
  const { networkName, ignition } = connection;
  const deploymentProfile = requireDeploymentProfile(
    process.env.DEPLOYMENT_PROFILE,
  );
  const config = getDeploymentConfig(deploymentProfile);

  // Fail fast before deploying: the registry mode is chosen by the profile while
  // the network is chosen independently by --network, so guard against pushing a
  // dev/mock registry onto a production chain (an irreversible mainnet mistake).
  const chainId = hexQuantityToNumber(
    (await connection.provider.request({ method: "eth_chainId" })) as string,
  );
  assertRegistryModeAllowedOnChain(chainId, config.mode, deploymentProfile);

  console.log(
    `Deploying profile "${deploymentProfile}" to network "${networkName}" in "${config.mode}" mode…`,
  );
  console.log(`Forums: ${config.forums.join(", ")}`);

  // Resolve where this deploy's shared artifact lives so we can compare the
  // previously-deployed contract fingerprint against the freshly compiled one.
  const isLocalDeployment = writesLocalDeploymentArtifact(networkName);
  const deploymentName = isLocalDeployment ? "localhost" : networkName;
  const deploymentsDir = path.resolve(import.meta.dirname, "../../deployments");
  const deploymentPath = path.join(deploymentsDir, `${deploymentName}.json`);

  // Clear stale Ignition journal state when the contracts have changed. Ignition
  // is idempotent: once a contract is recorded in its per-chain journal it is
  // never redeployed — even if its bytecode changed — so edited contracts would
  // otherwise silently never reach chain. FORCE_FRESH_DEPLOY=1 always wipes
  // (used by the break-glass redeploy target).
  const artifactFingerprint = computeDeployableArtifactFingerprint();
  const previousFingerprint =
    (existsSync(deploymentPath)
      ? (JSON.parse(readFileSync(deploymentPath, "utf8"))
          .artifactFingerprint as string | undefined)
      : undefined) ?? null;
  const journalDir = path.resolve(
    import.meta.dirname,
    "../ignition/deployments",
    `chain-${chainId}`,
  );
  if (existsSync(journalDir)) {
    if (process.env.FORCE_FRESH_DEPLOY === "1") {
      rmSync(journalDir, { recursive: true, force: true });
      console.log(
        `FORCE_FRESH_DEPLOY set — cleared Ignition journal at ${journalDir}.`,
      );
    } else if (previousFingerprint !== artifactFingerprint) {
      rmSync(journalDir, { recursive: true, force: true });
      console.log(
        "Compiled contracts changed since the last deploy — cleared Ignition " +
          `journal at ${journalDir} to force a fresh deployment.`,
      );
    } else {
      console.log(
        `Compiled contracts unchanged — reusing Ignition journal at ${journalDir}.`,
      );
    }
  }

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

  const blockNumber = hexQuantityToNumber(
    (await connection.provider.request({
      method: "eth_blockNumber",
    })) as string,
  );

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
    artifactFingerprint,
    updatedAt: new Date().toISOString(),
  };

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
