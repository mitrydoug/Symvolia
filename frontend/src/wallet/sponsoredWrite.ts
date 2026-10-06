import type { SendTransactionModalUIOptions } from "@privy-io/react-auth";
import { encodeFunctionData, formatEther, type Address } from "viem";
import type {
  ContractWriteRequest,
  SponsoredNetworkFeeEstimate,
} from "./types";

/**
 * Pure, React-free helpers for building and inspecting contract writes and
 * their sponsored-transaction UI. Kept separate from the hooks so the wallet
 * module's transaction logic can be reasoned about (and tested) in isolation.
 */

export const SPONSORED_NETWORK_FEE_ESTIMATE: SponsoredNetworkFeeEstimate = {
  kind: "sponsored",
  label: "Sponsored by Symvolia",
};

export const SELF_FUNDED_NETWORK_FEE_ESTIMATE: SponsoredNetworkFeeEstimate = {
  kind: "self-funded",
  label: "Paid from your connected wallet",
};

export const SPONSORSHIP_UNAVAILABLE_NETWORK_FEE_ESTIMATE: SponsoredNetworkFeeEstimate =
  {
    kind: "unavailable",
    label: "Sponsorship unavailable",
  };

const DEFAULT_SPONSORED_TRANSACTION_UI_OPTIONS: SendTransactionModalUIOptions =
  {
    description:
      "This publishes an update to Symvolia. The app sponsors the network fee, and this transaction does not transfer funds.",
    buttonText: "Continue",
    transactionInfo: {
      title: "What happens",
      action: "Publish update",
      contractInfo: {
        name: "Symvolia",
      },
    },
    successHeader: "Update submitted",
    successDescription: "Your update is now being confirmed on-chain.",
    isCancellable: true,
  };

const SPONSORED_TRANSACTION_UI_OPTIONS_BY_FUNCTION_NAME: Record<
  string,
  SendTransactionModalUIOptions
> = {
  register: {
    description:
      "This completes your Symvolia registration. The app sponsors the network fee, and this transaction does not transfer funds.",
    buttonText: "Complete registration",
    transactionInfo: {
      title: "",
      action: "Register identity",
      contractInfo: {
        name: "Symvolia Registry",
      },
    },
    successHeader: "Registration submitted",
    successDescription: "Your registration is now being confirmed on-chain.",
    isCancellable: true,
  },
  multicall: {
    description:
      "This publishes your staged statements and support changes. The app sponsors the network fee, and this transaction does not transfer funds.",
    buttonText: "Lock It In",
    transactionInfo: {
      title: "Lock In Your Changes",
      action: "Publish changes",
      contractInfo: {
        name: "Symvolia Forum",
      },
    },
    successHeader: "Changes submitted",
    successDescription: "Your changes are now being confirmed on-chain.",
    isCancellable: true,
  },
};

export const sponsoredTransactionUiOptions = (
  functionName: string,
  overrideOptions: SendTransactionModalUIOptions | undefined,
): SendTransactionModalUIOptions => {
  const defaultOptions =
    SPONSORED_TRANSACTION_UI_OPTIONS_BY_FUNCTION_NAME[functionName] ??
    DEFAULT_SPONSORED_TRANSACTION_UI_OPTIONS;

  return {
    ...defaultOptions,
    ...overrideOptions,
    transactionInfo: {
      ...defaultOptions.transactionInfo,
      ...overrideOptions?.transactionInfo,
      contractInfo: {
        ...defaultOptions.transactionInfo?.contractInfo,
        ...overrideOptions?.transactionInfo?.contractInfo,
      },
    },
  };
};

export const isAddress = (value: string | undefined): value is Address =>
  Boolean(value?.startsWith("0x"));

export const contractWriteData = (request: ContractWriteRequest) =>
  encodeFunctionData({
    abi: request.abi,
    functionName: request.functionName,
    args: request.args,
  });

export const smartWalletCalls = (request: ContractWriteRequest) => [
  {
    to: request.address,
    value: 0n,
    data: contractWriteData(request),
  },
];

/**
 * Parameters that ask the smart wallet to build/send a user operation *without*
 * the paymaster, so the smart wallet pays its own gas. Used to fall back from a
 * failed sponsored transaction while keeping the same participant identity.
 *
 * `paymaster: false` disables the client-configured paymaster at runtime; viem
 * omits `false` from the parameter's type union, so callers pass this through a
 * cast to the client method's parameter type.
 */
export const unsponsoredUserOperationRequest = (
  request: ContractWriteRequest,
) => ({
  calls: smartWalletCalls(request),
  paymaster: false as const,
});

const POLICY_LIMIT_PATTERNS = [
  "policy max count",
  "max count exceeded",
  "policy limit",
  "policy count",
];

const USER_REJECTION_PATTERNS = [
  "user rejected",
  "user denied",
  "user cancel",
  "rejected the request",
  "request rejected",
];

const errorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message.toLowerCase();
  if (typeof error === "string") return error.toLowerCase();
  return "";
};

/**
 * Human-readable warning describing why gas sponsorship failed, shown in the
 * fee estimate's tooltip. Distinguishes the common "policy exhausted" case from
 * everything else.
 */
export const classifySponsorshipWarning = (error: unknown): string => {
  const message = errorMessage(error);
  if (POLICY_LIMIT_PATTERNS.some((pattern) => message.includes(pattern))) {
    return "Max sponsored actions reached";
  }
  return "An error occurred";
};

/**
 * Whether a failed sponsored transaction should be retried self-funded. True
 * for any sponsorship failure (a webhook declining to sponsor, policy limits,
 * paymaster/RPC errors); false only for user rejections, which must propagate
 * so the caller can surface a cancellation rather than resubmit. Anything but
 * an explicit "yes, I'll sponsor" falls back to the self-funded flow.
 */
export const isPaymasterError = (error: unknown): boolean => {
  const message = errorMessage(error);
  if (USER_REJECTION_PATTERNS.some((pattern) => message.includes(pattern))) {
    return false;
  }
  return true;
};

const toBigInt = (value: unknown): bigint | undefined => {
  try {
    if (typeof value === "bigint") return value;
    if (typeof value === "number") return BigInt(value);
    if (typeof value === "string" && value !== "") return BigInt(value);
  } catch {
    return undefined;
  }
  return undefined;
};

/**
 * Total gas cost (in wei) of a prepared, self-funded user operation, or
 * `undefined` when the operation is missing the fields needed to price it.
 */
export const userOperationFeeWei = (
  userOperation: Record<string, unknown>,
): bigint | undefined => {
  const callGasLimit = toBigInt(userOperation.callGasLimit);
  const verificationGasLimit = toBigInt(userOperation.verificationGasLimit);
  const preVerificationGas = toBigInt(userOperation.preVerificationGas);
  const maxFeePerGas = toBigInt(userOperation.maxFeePerGas);

  if (
    callGasLimit === undefined ||
    verificationGasLimit === undefined ||
    preVerificationGas === undefined ||
    maxFeePerGas === undefined
  ) {
    return undefined;
  }

  return (
    (callGasLimit + verificationGasLimit + preVerificationGas) * maxFeePerGas
  );
};

/**
 * Formats a wei fee as an approximate USD string (e.g. `< $0.01`, `$0.42`), or
 * an empty string when it cannot be priced.
 */
export const formatUsdFee = (feeWei: bigint, ethUsdPrice: number): string => {
  const usd = Number(formatEther(feeWei)) * ethUsdPrice;
  if (!Number.isFinite(usd) || usd <= 0) return "";
  if (usd < 0.01) return "< $0.01";
  return `$${usd.toFixed(2)}`;
};

/**
 * Label for a smart wallet that is paying its own gas, optionally annotated
 * with an approximate cost (e.g. `Self-funded (< $0.01)`).
 */
export const selfFundedLabel = (feeUsd: string): string =>
  feeUsd ? `Self-funded (${feeUsd})` : "Self-funded";

const isNonZeroUserOperationValue = (value: unknown): boolean => {
  if (typeof value === "bigint") return value > 0n;
  if (typeof value === "number") return value > 0;
  if (typeof value !== "string") return false;

  if (value === "" || value === "0x") return false;

  try {
    return BigInt(value) > 0n;
  } catch {
    return false;
  }
};

const hasPaymasterFields = (userOperation: Record<string, unknown>) =>
  isNonZeroUserOperationValue(userOperation.paymasterAndData) ||
  isNonZeroUserOperationValue(userOperation.paymasterData) ||
  isAddress(userOperation.paymaster as string | undefined);

export const isSponsoredUserOperation = (
  userOperation: Record<string, unknown>,
) =>
  (isNonZeroUserOperationValue(userOperation.maxFeePerGas) === false &&
    isNonZeroUserOperationValue(userOperation.maxPriorityFeePerGas) ===
      false) ||
  hasPaymasterFields(userOperation);
