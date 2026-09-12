/**
 * Pre-deploy nonce check for live-network deployer accounts.
 *
 * Detects a stuck/dropped transaction: if the `pending` nonce is greater than
 * the `latest` nonce, there is a transaction sitting in the mempool that has
 * not confirmed. If they are equal, the account is clean and safe to deploy.
 *
 * The deployer address is derived from the target's private-key env var when
 * set; otherwise pass it explicitly as the second argument.
 *
 * Usage:
 *   npx tsx scripts/check-nonce.ts base_sepolia
 *   npx tsx scripts/check-nonce.ts base_sepolia 0x9a255857f736b892e200f37e0e1466b2dd00f34d
 */

import {
  createPublicClient,
  http,
  isAddress,
  type Chain,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";

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
  const target = process.argv[2] ?? "base_sepolia";
  const targetConfig = targets[target];
  if (!targetConfig) {
    console.error(`❌ Unknown nonce-check target "${target}".`);
    console.error(`Known targets: ${Object.keys(targets).join(", ")}`);
    process.exit(1);
  }

  const rpcUrl = process.env[targetConfig.rpcEnv];
  if (!rpcUrl) {
    console.error(`❌ ${targetConfig.rpcEnv} is not set.`);
    process.exit(1);
  }

  const addressArg = process.argv[3];
  let address: Address;
  if (addressArg) {
    if (!isAddress(addressArg)) {
      console.error(`❌ "${addressArg}" is not a valid address.`);
      process.exit(1);
    }
    address = addressArg;
  } else {
    const privateKey = process.env[targetConfig.privateKeyEnv];
    if (!privateKey) {
      console.error(
        `❌ ${targetConfig.privateKeyEnv} is not set and no address argument ` +
        `was provided.\nPass the deployer address explicitly, e.g.:\n` +
        `  npx tsx scripts/check-nonce.ts ${target} 0xYourDeployerAddress`,
      );
      process.exit(1);
    }
    address = privateKeyToAccount(privateKey as `0x${string}`).address;
  }

  const client = createPublicClient({
    chain: targetConfig.chain,
    transport: http(rpcUrl),
  });

  const [latest, pending] = await Promise.all([
    client.getTransactionCount({ address, blockTag: "latest" }),
    client.getTransactionCount({ address, blockTag: "pending" }),
  ]);

  console.log(`Target: ${target}`);
  console.log(`Deployer address: ${address}`);
  console.log(`Latest nonce (confirmed):  ${latest}`);
  console.log(`Pending nonce (mempool):   ${pending}`);

  if (pending > latest) {
    console.error(
      `\n❌ Stuck transaction detected: ${pending - latest} pending tx(s) ` +
      `occupying nonce(s) ${latest}..${pending - 1}.\n` +
      `These must confirm or be dropped/replaced before Ignition can deploy.\n` +
      `Options:\n` +
      `  - Wait for the mempool to evict the stuck tx, then re-check.\n` +
      `  - Send a same-nonce replacement with a higher fee to cancel it.\n` +
      `  - Use a reliable (non-load-balanced) RPC endpoint.`,
    );
    process.exit(1);
  }

  console.log(
    `\n✅ No stuck transactions. Next nonce is ${latest} — safe to deploy.`,
  );
}

main().catch((err) => {
  console.error("❌ Failed to check nonce:", err.message);
  process.exit(1);
});
