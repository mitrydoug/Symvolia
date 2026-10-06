import hre from "hardhat";
import path from "path";
import { MOCK_STATEMENTS, MOCK_SUPPORT } from "./seed/mock-data.js";
import {
  forumAddressForName,
  loadAbi,
  loadDeploymentEnv,
  repoRoot,
  requireDevRegistry,
  requireWalletCount,
} from "./seed/shared.js";
import { getDeploymentConfig } from "../ignition/config/deployments.js";

async function main() {
  const connection = await hre.network.connect();
  const deployment = loadDeploymentEnv();
  requireDevRegistry(deployment.registryMode);

  const config = getDeploymentConfig(deployment.deploymentProfile);
  if (config.mode !== "dev") {
    throw new Error(
      `Mock content seeding requires a dev deployment profile, got ${config.mode}`,
    );
  }

  const requiredAccountIndexes = [
    ...MOCK_STATEMENTS.map((statement) => statement.accountIndex),
    ...MOCK_SUPPORT.map((support) => support.accountIndex),
  ];

  const publicClient = await connection.viem.getPublicClient();
  const walletClients = await connection.viem.getWalletClients();
  requireWalletCount(walletClients.length, requiredAccountIndexes);

  const forumAbi = loadAbi(
    path.join(repoRoot, "blockchain/artifacts/contracts/Forum.sol/Forum.json"),
  );

  const statementFutures: Record<string, Promise<unknown>[]> = {};
  console.log(`Adding ${MOCK_STATEMENTS.length} standard mock statements...`);
  for (const [index, statement] of MOCK_STATEMENTS.entries()) {
    const forumAddress = forumAddressForName(
      statement.forum,
      config.forums,
      deployment.forumAddresses,
    );
    const hash = await walletClients[statement.accountIndex].writeContract({
      address: forumAddress,
      abi: forumAbi,
      functionName: "addStatement",
      args: [statement.content, BigInt(statement.initialSupport ?? 0)],
    });
    const receipt = publicClient.waitForTransactionReceipt({ hash });
    if (!statementFutures[statement.forum])
      statementFutures[statement.forum] = [];
    statementFutures[statement.forum].push(receipt);
    await receipt;
    console.log(`Added mock statement ${index + 1}/${MOCK_STATEMENTS.length}`);
  }

  console.log(`Applying ${MOCK_SUPPORT.length} standard mock support votes...`);
  for (const [index, support] of MOCK_SUPPORT.entries()) {
    await Promise.all(statementFutures[support.forum] ?? []);
    const forumAddress = forumAddressForName(
      support.forum,
      config.forums,
      deployment.forumAddresses,
    );
    const hash = await walletClients[support.accountIndex].writeContract({
      address: forumAddress,
      abi: forumAbi,
      functionName: "adjustSupport",
      args: [
        [
          {
            statementId: BigInt(support.statementIndex),
            value: BigInt(support.value),
            adjustmentType: 0,
          },
        ],
      ],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`Applied mock support ${index + 1}/${MOCK_SUPPORT.length}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
