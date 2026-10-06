import type { PublicClient } from "viem";
import { base, baseSepolia } from "wagmi/chains";

/**
 * On-chain ETH/USD price lookup used to render an approximate self-funded
 * network-fee estimate when gas sponsorship is unavailable.
 *
 * Prices come from Chainlink's decentralised price feeds rather than a
 * third-party HTTP API, keeping the estimate free of centralised dependencies
 * (see the project's decentralisation-first principle). Only the
 * sponsorship-capable chains need a feed entry; every other chain degrades to
 * a label without a dollar figure.
 */
const ETH_USD_FEEDS: Record<number, `0x${string}`> = {
  [base.id]: "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70",
  [baseSepolia.id]: "0x4aDC67696bA383F43DD60A9e78F2C97FbbFc7cb1",
};

const AGGREGATOR_ABI = [
  {
    type: "function",
    name: "latestRoundData",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

/**
 * Reads the current ETH/USD price from the connected chain's Chainlink feed.
 * Returns `undefined` when no feed is configured for the chain or the read
 * fails, so callers can degrade gracefully to a label without a dollar figure.
 */
export const fetchEthUsdPrice = async (
  publicClient: PublicClient,
): Promise<number | undefined> => {
  const feed = ETH_USD_FEEDS[publicClient.chain?.id ?? -1];
  if (!feed) return undefined;

  try {
    const [roundData, decimals] = await Promise.all([
      publicClient.readContract({
        address: feed,
        abi: AGGREGATOR_ABI,
        functionName: "latestRoundData",
      }),
      publicClient.readContract({
        address: feed,
        abi: AGGREGATOR_ABI,
        functionName: "decimals",
      }),
    ]);

    const answer = roundData[1];
    if (answer <= 0n) return undefined;

    return Number(answer) / 10 ** Number(decimals);
  } catch {
    return undefined;
  }
};
