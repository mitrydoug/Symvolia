import hre from "hardhat";
import path from "path";
import { existsSync, readFileSync, rmSync } from "fs";
import { formatEther, formatGwei, getAddress, type Address } from "viem";
import { createForumProductionModule } from "../ignition/modules/ForumProduction.js";
import { getDeploymentConfig } from "../ignition/config/deployments.js";

/**
 * Dry-run the production Base MAINNET deploy against a local mainnet fork.
 *
 * This deploys the exact production profile ("base") — the real SymvoliaRegistry
 * wired to the forked Base-mainnet zkPassport verifier — against the
 * `local_base_mainnet_fork` edr-simulated network. No real ETH is spent, no
 * mainnet state is touched, and the fork reports chainId 31337 so its Ignition
 * journal can never collide with the real chain-8453 journal.
 *
 * It verifies the deployed registry matches `ignition/parameters/base.json`
 * (scope / domain / devMode / verifier), that every forum is wired to the
 * registry, and reports the gas used plus a projected Base L2 cost.
 */

const PROFILE = "base";
const FORK_NETWORK = "local_base_mainnet_fork";

// Conservative Base L2 gas price for the cost projection. Base routinely settles
// at a few hundredths of a gwei; the local simulator prices gas far higher and
// does not model L2 fee structure, so its ETH figure is not representative.
const BASE_PROJECTED_GAS_PRICE_GWEI = 0.02;

const fail = (message: string): never => {
  throw new Error(message);
};

const hexToNumber = (value: string) => Number(BigInt(value));

async function main() {
  const connection = await hre.network.connect();
  const { networkName } = connection;

  if (networkName !== FORK_NETWORK) {
    fail(
      `fork-dry-run must run against the "${FORK_NETWORK}" network ` +
      `(got "${networkName}"). Re-run with --network ${FORK_NETWORK}.`,
    );
  }

  const config = getDeploymentConfig(PROFILE);
  // Direct throw (not fail) so TypeScript narrows the config union to the
  // ProductionDeploymentConfig branch that carries `parametersFile`.
  if (config.mode !== "production") {
    throw new Error(
      `Expected profile "${PROFILE}" to be a production deployment, got "${config.mode}".`,
    );
  }

  const parametersPath = path.resolve(
    import.meta.dirname,
    "../ignition/parameters",
    config.parametersFile,
  );
  const parameters = JSON.parse(readFileSync(parametersPath, "utf8")) as {
    ForumProductionModule: {
      verifierAddress: string;
      scope: string;
      domain: string;
      devMode: boolean;
    };
  };
  const expected = parameters.ForumProductionModule;
  const verifierAddress = getAddress(expected.verifierAddress);

  const chainId = hexToNumber(
    (await connection.provider.request({ method: "eth_chainId" })) as string,
  );

  // Always deploy fresh: wipe any journal left by a prior dry-run.
  const journalDir = path.resolve(
    import.meta.dirname,
    "../ignition/deployments",
    `chain-${chainId}`,
  );
  if (existsSync(journalDir)) {
    rmSync(journalDir, { recursive: true, force: true });
    console.log(`Cleared Ignition journal at ${journalDir}.`);
  }

  // The real verifier only exists on the fork if the fork source is Base
  // mainnet. Without its bytecode the proof flow could never work, so fail
  // loudly rather than deploy a registry pointed at an empty address. Direct
  // throw so TypeScript narrows `verifierCode` to a non-empty string below.
  const verifierCode = (await connection.provider.request({
    method: "eth_getCode",
    params: [verifierAddress, "latest"],
  })) as string;
  if (!verifierCode || verifierCode === "0x") {
    throw new Error(
      `No bytecode at verifier ${verifierAddress} on "${networkName}". ` +
      "Is BASE_RPC_URL pointed at Base mainnet?",
    );
  }
  console.log(
    `✔ Real ZKPassport verifier present at ${verifierAddress} ` +
    `(${(verifierCode.length - 2) / 2} bytes).`,
  );

  const publicClient = await connection.viem.getPublicClient();
  const [deployer] = await connection.viem.getWalletClients();
  const deployerAddress = deployer.account.address;

  const blockBefore = await publicClient.getBlockNumber();
  const balanceBefore = await publicClient.getBalance({
    address: deployerAddress,
  });

  console.log(
    `\nDeploying production profile "${PROFILE}" to "${networkName}" ` +
    `(chainId ${chainId})…`,
  );

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

  const deployed = (await connection.ignition.deploy(module, {
    parameters: parametersPath,
  })) as Record<string, { address: Address }>;
  const { registry, ...forums } = deployed;

  const blockAfter = await publicClient.getBlockNumber();
  const balanceAfter = await publicClient.getBalance({
    address: deployerAddress,
  });

  console.log(`\n✔ Deployed SymvoliaRegistry at ${registry.address}`);
  for (const [name, contract] of Object.entries(forums)) {
    console.log(`✔ Deployed Forum (${name}) at ${contract.address}`);
  }

  // --- Verify the deployed registry matches the production parameters. -----
  const registryContract = await connection.viem.getContractAt(
    "SymvoliaRegistry",
    registry.address as Address,
  );
  const [onChainScope, onChainDomain, onChainDevMode, onChainVerifier] =
    await Promise.all([
      registryContract.read.scope(),
      registryContract.read.domain(),
      registryContract.read.devMode(),
      registryContract.read.zkPassportVerifier(),
    ]);

  if (onChainScope !== expected.scope) {
    fail(
      `Scope mismatch: on-chain "${onChainScope}" != expected "${expected.scope}".`,
    );
  }
  if (onChainDomain !== expected.domain) {
    fail(
      `Domain mismatch: on-chain "${onChainDomain}" != expected "${expected.domain}".`,
    );
  }
  if (onChainDevMode !== expected.devMode) {
    fail(
      `devMode mismatch: on-chain ${onChainDevMode} != expected ${expected.devMode}.`,
    );
  }
  if (getAddress(onChainVerifier) !== verifierAddress) {
    fail(
      `Verifier mismatch: on-chain ${onChainVerifier} != expected ${verifierAddress}.`,
    );
  }
  console.log(
    `\n✔ Registry config verified: scope="${onChainScope}", ` +
    `domain="${onChainDomain}", devMode=${onChainDevMode}, ` +
    `verifier=${getAddress(onChainVerifier)}.`,
  );

  // Every forum must point back at the single deployed registry.
  for (const [name, contract] of Object.entries(forums)) {
    const forumContract = await connection.viem.getContractAt(
      "Forum",
      contract.address,
    );
    const wired = getAddress(await forumContract.read.symvoliaRegistry());
    if (wired !== getAddress(registry.address)) {
      fail(
        `Forum "${name}" registry mismatch: ${wired} != ${getAddress(registry.address)}.`,
      );
    }
  }
  console.log(
    `✔ All ${Object.keys(forums).length} forums wired to the registry.`,
  );

  // --- Gas reporting -------------------------------------------------------
  let gasUsed = 0n;
  for (let b = blockBefore + 1n; b <= blockAfter; b++) {
    const block = await publicClient.getBlock({ blockNumber: b });
    gasUsed += block.gasUsed;
  }
  const spentWei = balanceBefore - balanceAfter;
  const localGasPriceWei = gasUsed > 0n ? spentWei / gasUsed : 0n;
  const projectedBaseWei =
    gasUsed * BigInt(Math.round(BASE_PROJECTED_GAS_PRICE_GWEI * 1e9));

  console.log("\n─── Gas ────────────────────────────────────────────────");
  console.log(`Total gas used:            ${gasUsed.toLocaleString()} gas`);
  console.log(
    `Local fork gas price:      ~${formatGwei(localGasPriceWei)} gwei ` +
    "(simulated — NOT Base)",
  );
  console.log(
    `Local fork ETH spent:      ${formatEther(spentWei)} ETH (simulated)`,
  );
  console.log(
    `Projected Base @ ${BASE_PROJECTED_GAS_PRICE_GWEI} gwei:  ` +
    `${formatEther(projectedBaseWei)} ETH`,
  );
  console.log(
    "Note: Base L2 settles far below the local simulator's gas price; the " +
    "real total is typically well under US$1-2.",
  );

  console.log("\n✅ Production fork dry-run PASSED.");
}

main().catch((err) => {
  console.error(err);
  console.error("\n❌ Production fork dry-run FAILED.");
  process.exit(1);
});
