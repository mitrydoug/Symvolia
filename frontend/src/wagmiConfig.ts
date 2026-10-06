import { createConfig } from "@privy-io/wagmi";
import type { PrivyClientConfig } from "@privy-io/react-auth";
import type { SupportedChain } from "@zkpassport/sdk";
import { base, baseSepolia, hardhat, type Chain } from "wagmi/chains";
import { http } from "wagmi";
import { optionalEnvValue, requiredEnvValue } from "./envVars";
import { resolveRpcUrl } from "./rpcUrl";

// ---------------------------------------------------------------------------
// Derive the single target chain from VITE_NETWORK.  Every deployment is
// confined to exactly one chain. Privy and the network guard both use this
// target to keep connected wallets on the deployed chain.
// ---------------------------------------------------------------------------

const networkToChain = {
  localhost: hardhat,
  base,
  base_sepolia: baseSepolia,
} satisfies Record<string, Chain>;

type NetworkName = keyof typeof networkToChain;

const isNetworkName = (value: string): value is NetworkName =>
  value in networkToChain;

const networkNameValue = requiredEnvValue(
  "VITE_NETWORK",
  import.meta.env.VITE_NETWORK,
);

if (!isNetworkName(networkNameValue)) {
  throw new Error(
    `Unsupported VITE_NETWORK "${networkNameValue}". Expected one of: ${Object.keys(
      networkToChain,
    ).join(", ")}.`,
  );
}

const networkName = networkNameValue;

export const targetChain: Chain = networkToChain[networkName];

// ZKPassport `bind("chain", …)` value for this deployment. The bound chain is
// committed into the proof and enforced on-chain by SymvoliaRegistry
// (`boundData.chainId == block.chainid`), so it MUST map to `targetChain`.
const networkToZkPassportChain = {
  localhost: "local",
  base: "base",
  base_sepolia: "base_sepolia",
} satisfies Record<NetworkName, SupportedChain>;

export const zkPassportBindChain: SupportedChain =
  networkToZkPassportChain[networkName];

const networkToAverageBlockTimeSeconds: Record<string, number> = {
  localhost: 1,
  base: 2,
  base_sepolia: 2,
};

export const targetAverageBlockTimeSeconds =
  networkToAverageBlockTimeSeconds[networkName];

const _rawBlockPollingInterval = parseInt(
  import.meta.env.VITE_BLOCK_POLLING_INTERVAL_SECONDS ?? "",
  10,
);
export const blockPollingIntervalMs = Number.isFinite(_rawBlockPollingInterval)
  ? _rawBlockPollingInterval * 1000
  : 60_000;

export const privyAppId = optionalEnvValue(import.meta.env.VITE_PRIVY_APP_ID);
const isGasSponsorshipRequested =
  import.meta.env.VITE_ENABLE_GAS_SPONSORSHIP === "true";
const gasSponsorshipSupportedChainIds: ReadonlySet<number> = new Set([
  base.id,
  baseSepolia.id,
]);
// Whether gas sponsorship is *available* for this deployment (env flag + a
// supported chain). This is a capability flag, not a per-user decision: the
// wallet module (`useActiveWallet`) only sponsors when the user actually has a
// smart wallet connected. External and embedded-EOA wallets are self-funded.
export const isGasSponsorshipEnabled =
  isGasSponsorshipRequested &&
  gasSponsorshipSupportedChainIds.has(targetChain.id);
export const alchemyGasPolicyId = optionalEnvValue(
  import.meta.env.VITE_ALCHEMY_GAS_POLICY_ID,
);
export const smartWalletsConfig =
  isGasSponsorshipEnabled && alchemyGasPolicyId
    ? { paymasterContext: { policyId: alchemyGasPolicyId } }
    : undefined;

const targetRpcUrl = resolveRpcUrl(
  requiredEnvValue("VITE_RPC_URL", import.meta.env.VITE_RPC_URL),
);

export const privyConfig = {
  appearance: {
    theme: "light",
    accentColor: "#1976d2",
    showWalletLoginFirst: false,
    walletChainType: "ethereum-only",
    walletList: [
      "detected_wallets",
      "metamask",
      "coinbase_wallet",
    ],
  },
  loginMethods: ["email", "wallet", "passkey"],
  supportedChains: [targetChain],
  defaultChain: targetChain,
  embeddedWallets: {
    ethereum: {
      createOnLogin: "users-without-wallets",
    },
    // Sign transactions headlessly. Every write is gated behind our own
    // CommitConfirmationDialog, so Privy's default "Sign message" prompt is
    // redundant. This is also the only public lever that suppresses that modal
    // on the headless self-funded (paymaster-off) send path, where we call the
    // unwrapped `sendUserOperation` and Privy's internal `hideWalletUIs` ref is
    // never toggled for us.
    showWalletUIs: false,
  },
} satisfies PrivyClientConfig;

const wagmiConfig = createConfig({
  chains: [targetChain] as const,
  transports: {
    [targetChain.id]: http(targetRpcUrl),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}

export default wagmiConfig;
