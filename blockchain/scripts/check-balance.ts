/**
 * Pre-deploy balance check for live-network deployer accounts.
 *
 * Usage:
 *   npx tsx scripts/check-balance.ts base
 *   npx tsx scripts/check-balance.ts base_sepolia
 */

import { createPublicClient, formatEther, http, type Chain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";

const MIN_BALANCE_WEI = BigInt("1000000000000000"); // 0.001 ETH

const targets: Record<
  string,
  { chain: Chain; rpcEnv: string; privateKeyEnv: string }
> = {
  base: {
    chain: base,
    rpcEnv: "BASE_RPC_URL",
    privateKeyEnv: "BASE_DEPLOYER_PRIVATE_KEY",
  },
  base_sepolia: {
    chain: baseSepolia,
    rpcEnv: "BASE_SEPOLIA_RPC_URL",
    privateKeyEnv: "BASE_SEPOLIA_DEPLOYER_PRIVATE_KEY",
  },
};

async function main() {
  const target = process.argv[2] ?? "base";
  const targetConfig = targets[target];
  if (!targetConfig) {
    console.error(`❌ Unknown balance-check target "${target}".`);
    console.error(`Known targets: ${Object.keys(targets).join(", ")}`);
    process.exit(1);
  }

  const rpcUrl = process.env[targetConfig.rpcEnv];
  const privateKey = process.env[targetConfig.privateKeyEnv];

  if (!rpcUrl) {
    console.error(`❌ ${targetConfig.rpcEnv} is not set.`);
    process.exit(1);
  }
  if (!privateKey) {
    console.error(`❌ ${targetConfig.privateKeyEnv} is not set.`);
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const client = createPublicClient({
    chain: targetConfig.chain,
    transport: http(rpcUrl),
  });

  const balance = await client.getBalance({ address: account.address });
  const balanceEth = formatEther(balance);

  console.log(`Target: ${target}`);
  console.log(`Deployer address: ${account.address}`);
  console.log(`Balance: ${balanceEth} ETH`);

  if (balance < MIN_BALANCE_WEI) {
    console.error(
      `\n❌ Insufficient funds: ${balanceEth} ETH is below the minimum ` +
      `threshold of ${formatEther(MIN_BALANCE_WEI)} ETH.\n` +
      `Please fund the deployer wallet before running reconciliation.`,
    );
    process.exit(1);
  }

  console.log("✅ Balance is sufficient for reconciliation.");
}

main().catch((err) => {
  console.error("❌ Failed to check balance:", err.message);
  process.exit(1);
});
