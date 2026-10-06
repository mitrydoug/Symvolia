/**
 * Contract bindings — barrel export for the frontend.
 *
 * ABIs are loaded from compiled Hardhat artifacts (TypeScript files committed
 * to the repo). Addresses come from per-network files under `networks/`,
 * selected at build time via the `VITE_NETWORK` environment variable.
 * The active registry ABI is selected via `VITE_REGISTRY_MODE`.
 */

import ForumABI from "./abis/Forum";
import SymvoliaRegistryABI from "./abis/SymvoliaRegistry";
import MockSymvoliaRegistryABI from "./abis/MockSymvoliaRegistry";
import DevSymvoliaRegistryABI from "./abis/DevSymvoliaRegistry";

// ---------------------------------------------------------------------------
// Network addresses — resolved at build time via import.meta.glob so that
// gitignored dev-network files don't cause errors in production builds.
// ---------------------------------------------------------------------------

type NetworkModule = {
  FORUMS: Readonly<Record<string, `0x${string}`>>;
  REGISTRY_ADDRESS: `0x${string}`;
};

const networkModules = import.meta.glob<NetworkModule>("./networks/*.ts", {
  eager: true,
});

const networkName = import.meta.env.VITE_NETWORK ?? "localhost";
const activeNetwork = networkModules[`./networks/${networkName}.ts`];

if (!activeNetwork) {
  const available = Object.keys(networkModules)
    .map((k) => k.replace("./networks/", "").replace(".ts", ""))
    .join(", ");
  throw new Error(
    `Network "${networkName}" not found. ` +
    `Run the deploy script or set VITE_NETWORK. Available: ${available}`,
  );
}

export const FORUMS = activeNetwork.FORUMS;

const REGISTRY_ADDRESS = activeNetwork.REGISTRY_ADDRESS;

const registryMode = import.meta.env.VITE_REGISTRY_MODE ?? "dev";

/**
 * true when the frontend targets a non-production registry (dev or mock).
 * Controls the ZKPassport SDK `devMode` flag so dev/mock proofs are accepted.
 */
export const isDevMode = registryMode !== "production";

/**
 * true when the frontend targets the address-derived DevSymvoliaRegistry,
 * which exposes the instant `register(string)` quick-register flow. The "mock"
 * and "production" modes both use the full ZKPassport proof flow instead.
 */
export const isQuickRegisterMode = registryMode === "dev";

export const FORUM_ABI = ForumABI;

/**
 * Contract config for the active proof-based registry. `register()` expects
 * `ProofVerificationParams` from zkpassport. Used by both production
 * (SymvoliaRegistry) and mock (MockSymvoliaRegistry) modes; the mock ABI is
 * selected in "mock" mode so its custom errors decode correctly.
 */
export const registryContractConfig = {
  address: REGISTRY_ADDRESS,
  abi: registryMode === "mock" ? MockSymvoliaRegistryABI : SymvoliaRegistryABI,
} as const;

/**
 * Contract config for the DevSymvoliaRegistry (dev mode only).
 * `register()` accepts a plain nationality string for instant registration.
 */
export const devRegistryContractConfig = {
  address: REGISTRY_ADDRESS,
  abi: DevSymvoliaRegistryABI,
} as const;
