import hre from "hardhat";
import path from "path";
import { readFileSync } from "fs";
import {
  type Abi,
  type Address,
  createWalletClient,
  custom,
  formatUnits,
  parseEther,
  keccak256,
  toBytes,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  getDeploymentConfig,
  requireDeploymentProfile,
  CRED_MULT,
} from "../ignition/config/deployments.js";

type Artifact = { abi: Abi };
type EnvValues = Record<string, string>;
type UserVotePlan = Map<number, number>;

const USER_COUNT = 1_000;
const TARGET_FORUM = process.env.STRESS_FORUM ?? "global";
const TOP_STATEMENT_SUPPORT = 3_200;
const TARGET_TOP_SHARE = 0.8;
const CONCURRENCY = 25;
const SUPPORT_CONCURRENCY = 10;
const SUPPORT_ADJUSTMENT_BATCH_SIZE = 1;
const SUPPORT_TRANSACTION_GAS = 25_000_000n;
const USER_BALANCE = parseEther("10");

const repoRoot = path.resolve(import.meta.dirname, "../..");
const statementsPath = path.join(
  repoRoot,
  "blockchain/fixtures/stress-statements.txt",
);
const deploymentEnvPath = path.join(
  repoRoot,
  "backend/.generated/deployment.env",
);

function parseEnvFile(filePath: string): EnvValues {
  const values: EnvValues = {};
  const contents = readFileSync(filePath, "utf8");

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = line.slice(0, equalsIndex);
    let value = line.slice(equalsIndex + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }

  return values;
}

function loadAbi(artifactPath: string): Abi {
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8")) as Artifact;
  return artifact.abi;
}

function loadStatements(): string[] {
  const statements = readFileSync(statementsPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (statements.length === 0) {
    throw new Error(`No statements found in ${statementsPath}`);
  }

  return statements;
}

function topShareForExponent(statementCount: number, exponent: number): number {
  const targets = rawSupportTargets(statementCount, exponent);
  const topCount = Math.ceil(statementCount * 0.2);
  const topSupport = targets
    .slice(0, topCount)
    .reduce((sum, value) => sum + value, 0);
  const totalSupport = targets.reduce((sum, value) => sum + value, 0);
  return topSupport / totalSupport;
}

function rawSupportTargets(statementCount: number, exponent: number): number[] {
  return Array.from({ length: statementCount }, (_, index) =>
    Math.max(
      1,
      Math.round(TOP_STATEMENT_SUPPORT / Math.pow(index + 1, exponent)),
    ),
  );
}

function buildSupportTargets(statementCount: number): number[] {
  let low = 0.1;
  let high = 3;

  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    if (topShareForExponent(statementCount, mid) < TARGET_TOP_SHARE) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return rawSupportTargets(statementCount, high);
}

function buildVotePlans(
  statementIds: number[],
  targets: number[],
): UserVotePlan[] {
  const plans: UserVotePlan[] = Array.from(
    { length: USER_COUNT },
    () => new Map(),
  );
  let userOffset = 0;

  for (let i = 0; i < statementIds.length; i++) {
    const target = targets[i];
    const baseSupport = Math.floor(target / USER_COUNT);
    const remainder = target % USER_COUNT;

    for (let j = 0; j < USER_COUNT; j++) {
      const userIndex = (userOffset + j) % USER_COUNT;
      const support = baseSupport + (j < remainder ? 1 : 0);
      if (support > 0) {
        plans[userIndex].set(statementIds[i], support);
      }
    }

    userOffset = (userOffset + 137) % USER_COUNT;
  }

  return plans;
}

function creditCostForSupport(support: number): number {
  return (support * (support + 1)) / 2;
}

function assertCreditBudgets(plans: UserVotePlan[]): void {
  const maxCost = Math.max(
    ...plans.map((plan) =>
      [...plan.values()].reduce(
        (sum, support) => sum + creditCostForSupport(support),
        0,
      ),
    ),
  );

  if (maxCost > 900) {
    throw new Error(
      `Generated support plan is too expensive for a user: max cost ${maxCost} credits`,
    );
  }

  console.log(`Maximum per-user support cost: ${maxCost} credits`);
}

function supportParts(displayCredits: number): bigint {
  return BigInt(displayCredits) * BigInt(CRED_MULT);
}

function chunkArray<T>(items: readonly T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

function fakeUserAccount(index: number) {
  const privateKey = keccak256(toBytes(`symvolia-stress-user-${index}`));
  return privateKeyToAccount(privateKey);
}

async function runConcurrently<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        await worker(items[index], index);
      }
    },
  );

  await Promise.all(workers);
}

async function main() {
  const connection = await hre.network.connect();
  const { networkName, provider } = connection;
  const deploymentProfile = requireDeploymentProfile(
    process.env.DEPLOYMENT_PROFILE,
  );
  const config = getDeploymentConfig(deploymentProfile);
  if (config.mode !== "dev") {
    throw new Error(
      `Stress seeding requires a dev deployment, got ${config.mode}`,
    );
  }

  if (!config.forums.includes(TARGET_FORUM)) {
    throw new Error(
      `Forum ${TARGET_FORUM} is not deployed by profile ${deploymentProfile}`,
    );
  }

  const env = parseEnvFile(deploymentEnvPath);
  const registryAddress = env.REGISTRY_ADDRESS as Address | undefined;
  const forumAddresses = env.FORUM_CONTRACT_ADDRESSES?.split(",").map((value) =>
    value.trim(),
  );
  if (!registryAddress || !forumAddresses) {
    throw new Error(`Missing deployment values in ${deploymentEnvPath}`);
  }

  const forumIndex = config.forums.indexOf(TARGET_FORUM);
  const forumAddress = forumAddresses[forumIndex] as Address | undefined;
  if (!forumAddress) {
    throw new Error(`Missing deployed address for forum ${TARGET_FORUM}`);
  }

  const registryAbi = loadAbi(
    path.join(
      repoRoot,
      "blockchain/artifacts/contracts/DevSymvoliaRegistry.sol/DevSymvoliaRegistry.json",
    ),
  );
  const forumAbi = loadAbi(
    path.join(repoRoot, "blockchain/artifacts/contracts/Forum.sol/Forum.json"),
  );

  const publicClient = await connection.viem.getPublicClient();
  const testClient = await connection.viem.getTestClient();
  const accounts = Array.from({ length: USER_COUNT }, (_, index) =>
    fakeUserAccount(index),
  );
  const walletClients = accounts.map((account) =>
    createWalletClient({
      account,
      chain: publicClient.chain,
      transport: custom(provider),
    }),
  );

  const statements = loadStatements();
  const maxStatementLength = Number(
    await publicClient.readContract({
      address: forumAddress,
      abi: forumAbi,
      functionName: "maxStatementLength",
    }),
  );
  const oversized = statements
    .map((statement, index) => ({
      statement,
      index,
      length: Buffer.byteLength(statement, "utf8"),
    }))
    .filter(({ length }) => length > maxStatementLength);
  if (oversized.length > 0) {
    throw new Error(
      `Found ${oversized.length} statement(s) over maxStatementLength=${maxStatementLength}: ` +
      oversized
        .map(({ index, length }) => `line ${index + 1} (${length})`)
        .join(", "),
    );
  }

  console.log(
    `Seeding ${statements.length} statements and ${USER_COUNT} users into ${TARGET_FORUM} (${forumAddress})`,
  );

  await provider.request({ method: "evm_setAutomine", params: [true] });
  await provider.request({ method: "evm_setIntervalMining", params: [0] });

  try {
    console.log("Funding generated users...");
    for (const account of accounts) {
      await testClient.setBalance({
        address: account.address,
        value: USER_BALANCE,
      });
    }

    console.log("Registering generated users...");
    await runConcurrently(
      walletClients,
      CONCURRENCY,
      async (walletClient, index) => {
        const hash = await walletClient.writeContract({
          address: registryAddress,
          abi: registryAbi,
          functionName: "register",
          args: ["USA"],
        });
        await publicClient.waitForTransactionReceipt({ hash });
        if ((index + 1) % 100 === 0) {
          console.log(`Registered ${index + 1}/${USER_COUNT} users`);
        }
      },
    );

    const startingStatementCount = Number(
      await publicClient.readContract({
        address: forumAddress,
        abi: forumAbi,
        functionName: "statementCount",
      }),
    );

    console.log("Adding stress statements...");
    const authorWallet = walletClients[0];
    for (let i = 0; i < statements.length; i++) {
      const hash = await authorWallet.writeContract({
        address: forumAddress,
        abi: forumAbi,
        functionName: "addStatement",
        args: [statements[i], 0n],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      if ((i + 1) % 25 === 0 || i + 1 === statements.length) {
        console.log(`Added ${i + 1}/${statements.length} statements`);
      }
    }

    const statementIds = statements.map(
      (_, index) => startingStatementCount + index,
    );
    const supportTargets = buildSupportTargets(statements.length);
    const votePlans = buildVotePlans(statementIds, supportTargets);
    assertCreditBudgets(votePlans);

    const topCount = Math.ceil(statements.length * 0.2);
    const topSupport = supportTargets
      .slice(0, topCount)
      .reduce((sum, value) => sum + value, 0);
    const totalSupport = supportTargets.reduce((sum, value) => sum + value, 0);
    console.log(
      `Support distribution: top statement=${supportTargets[0]}, top ${topCount} share=${(
        (topSupport / totalSupport) *
        100
      ).toFixed(1)}%, total=${totalSupport}`,
    );

    console.log("Applying support votes...");
    await runConcurrently(
      votePlans,
      SUPPORT_CONCURRENCY,
      async (plan, index) => {
        const supportAdjustments = [...plan.entries()].map(
          ([statementId, support]) => ({
            statementId: BigInt(statementId),
            value: supportParts(support),
            adjustmentType: 0,
          }),
        );

        if (supportAdjustments.length === 0) return;

        for (const supportBatch of chunkArray(
          supportAdjustments,
          SUPPORT_ADJUSTMENT_BATCH_SIZE,
        )) {
          const hash = await walletClients[index].writeContract({
            address: forumAddress,
            abi: forumAbi,
            functionName: "adjustSupport",
            args: [supportBatch],
            gas: SUPPORT_TRANSACTION_GAS,
          });
          await publicClient.waitForTransactionReceipt({ hash });
        }

        if ((index + 1) % 100 === 0) {
          console.log(`Applied support for ${index + 1}/${USER_COUNT} users`);
        }
      },
    );

    const rankedCount = await publicClient.readContract({
      address: forumAddress,
      abi: forumAbi,
      functionName: "rankedCount",
    });
    const topStatement = await publicClient.readContract({
      address: forumAddress,
      abi: forumAbi,
      functionName: "getRankedStatement",
      args: [0n],
    });

    const topStatementSupport = Array.isArray(topStatement)
      ? topStatement[3]
      : undefined;
    console.log(`Ranked statements: ${rankedCount}`);
    if (typeof topStatementSupport === "bigint") {
      console.log(
        `Top statement support: ${formatUnits(topStatementSupport, 6)}`,
      );
    }
  } finally {
    await provider.request({ method: "evm_setAutomine", params: [false] });
    await provider.request({
      method: "evm_setIntervalMining",
      params: [12000],
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
