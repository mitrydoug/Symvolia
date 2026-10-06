import type { HardhatUserConfig } from "hardhat/config";

import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import hardhatKeystore from "@nomicfoundation/hardhat-keystore";
import hardhatNetworkHelpers from "@nomicfoundation/hardhat-network-helpers";

import { configVariable } from "hardhat/config";

const BASE_SEPOLIA_FORK_BLOCK_NUMBER = Number(
  process.env.BASE_SEPOLIA_FORK_BLOCK_NUMBER ?? "43106971",
);

// Base MAINNET fork pin. Left unset by default so the fork anchors to the
// LATEST block (minimizing the initial offset from real time). Note a fork's
// block.timestamp does NOT track wall-clock on its own — it stays frozen near
// the forked block until blocks are mined — so the base-fork dev flow realigns
// the chain clock to real time at startup (see scripts/dev/contracts.sh,
// realign_fork_clock). Set BASE_MAINNET_FORK_BLOCK_NUMBER only to pin for
// reproducibility; a stale pin breaks zkPassport proof-validity checks.
const BASE_MAINNET_FORK_BLOCK_NUMBER = process.env
  .BASE_MAINNET_FORK_BLOCK_NUMBER
  ? Number(process.env.BASE_MAINNET_FORK_BLOCK_NUMBER)
  : undefined;

const config: HardhatUserConfig = {
  plugins: [hardhatToolboxViemPlugin, hardhatNetworkHelpers, hardhatKeystore],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
      },
      production: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    default: {
      type: "edr-simulated",
    },
    local_base_sepolia_fork: {
      type: "edr-simulated",
      forking: {
        url: configVariable("BASE_SEPOLIA_RPC_URL"),
        blockNumber: BASE_SEPOLIA_FORK_BLOCK_NUMBER,
      },
    },
    local_base_mainnet_fork: {
      type: "edr-simulated",
      forking: {
        url: configVariable("BASE_RPC_URL"),
        ...(BASE_MAINNET_FORK_BLOCK_NUMBER !== undefined
          ? { blockNumber: BASE_MAINNET_FORK_BLOCK_NUMBER }
          : {}),
      },
    },
    base: {
      type: "http",
      chainType: "op",
      url: configVariable("BASE_RPC_URL"),
      accounts: [configVariable("BASE_DEPLOYER_PRIVATE_KEY")],
    },
    base_sepolia: {
      type: "http",
      chainType: "op",
      url: configVariable("BASE_SEPOLIA_RPC_URL"),
      accounts: [configVariable("BASE_SEPOLIA_DEPLOYER_PRIVATE_KEY")],
    },
    localhost: {
      type: "http",
      url: "http://127.0.0.1:8545",
    },
  },
};

export default config;
