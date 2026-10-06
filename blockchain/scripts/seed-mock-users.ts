import hre from "hardhat";
import path from "path";
import { MOCK_REGISTRATIONS } from "./seed/mock-data.js";
import {
  loadAbi,
  loadDeploymentEnv,
  repoRoot,
  requireDevRegistry,
  requireWalletCount,
} from "./seed/shared.js";

async function main() {
  const connection = await hre.network.connect();
  const deployment = loadDeploymentEnv();
  requireDevRegistry(deployment.registryMode);

  const publicClient = await connection.viem.getPublicClient();
  const walletClients = await connection.viem.getWalletClients();
  requireWalletCount(
    walletClients.length,
    MOCK_REGISTRATIONS.map((registration) => registration.accountIndex),
  );

  const registryAbi = loadAbi(
    path.join(
      repoRoot,
      "blockchain/artifacts/contracts/DevSymvoliaRegistry.sol/DevSymvoliaRegistry.json",
    ),
  );

  console.log(
    `Registering ${MOCK_REGISTRATIONS.length} mock user entries against ${deployment.registryAddress}`,
  );

  for (const [index, registration] of MOCK_REGISTRATIONS.entries()) {
    const hash = await walletClients[registration.accountIndex].writeContract({
      address: deployment.registryAddress,
      abi: registryAbi,
      functionName: "register",
      args: [registration.nationality],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(
      `Registered mock entry ${index + 1}/${MOCK_REGISTRATIONS.length}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
