import type { SendTransactionModalUIOptions } from "@privy-io/react-auth";
import type { Abi, Address } from "viem";

/**
 * The kind of wallet the user currently has active. The rest of the app should
 * not need to branch on this — it is used internally by the wallet module to
 * decide identity and gas-sponsorship behaviour.
 *
 * - `none`      — no wallet connected.
 * - `external`  — a self-custodied wallet (MetaMask, Coinbase Wallet, etc.).
 * - `embedded`  — a Privy embedded EOA with no smart wallet available.
 * - `smart`     — a Privy smart wallet (sponsored) backed by the embedded EOA.
 */
export type WalletKind = "none" | "external" | "embedded" | "smart";

export type SponsoredNetworkFeeEstimate = {
  kind: "sponsored" | "self-funded" | "unavailable";
  label: string;
  /** Informational secondary text shown beneath the fee, in a muted colour. */
  reason?: string;
  /**
   * When present, the transaction fell back from gas sponsorship to a
   * self-funded flow because sponsorship errored. The UI surfaces this as an
   * amber warning icon with the string as its tooltip.
   */
  warning?: string;
};

export type ContractWriteRequest = {
  address: Address;
  abi: Abi | readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
  gas?: bigint;
  uiOptions?: SendTransactionModalUIOptions;
  /**
   * When true, the fee preview already determined this operation will not be
   * sponsored, so the sponsored attempt is skipped and the smart wallet pays
   * its own gas directly.
   */
  selfFunded?: boolean;
};
