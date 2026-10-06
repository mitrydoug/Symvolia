import { useCallback } from "react";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { usePublicClient, useWriteContract } from "wagmi";
import type { Hex } from "viem";
import { alchemyGasPolicyId, targetChain } from "@/wagmiConfig";
import { useActiveWallet } from "./useActiveWallet";
import { fetchEthUsdPrice } from "./ethUsdPrice";
import {
  SELF_FUNDED_NETWORK_FEE_ESTIMATE,
  SPONSORED_NETWORK_FEE_ESTIMATE,
  SPONSORSHIP_UNAVAILABLE_NETWORK_FEE_ESTIMATE,
  contractWriteData,
  formatUsdFee,
  isPaymasterError,
  selfFundedLabel,
  sponsoredTransactionUiOptions,
  unsponsoredUserOperationRequest,
  userOperationFeeWei,
} from "./sponsoredWrite";
import {
  eligibilityFeeExtra,
  fetchSponsorshipEligibility,
} from "./sponsorshipEligibility";
import type {
  ContractWriteRequest,
  SponsoredNetworkFeeEstimate,
} from "./types";

/**
 * Wallet-kind-agnostic contract write API. Callers hand it a contract write and
 * it routes transparently: sponsored (via the Privy smart wallet) when the
 * active wallet is a smart wallet, otherwise self-funded (via wagmi). The only
 * consumer that needs to distinguish the two is the confirmation dialog, which
 * reads `previewNetworkFee`'s `kind`.
 */
export const useContractWrite = () => {
  const { writeContractAsync } = useWriteContract();
  const { getClientForChain } = useSmartWallets();
  const { isSponsored } = useActiveWallet();
  const publicClient = usePublicClient();

  const previewNetworkFee = useCallback(
    async (
      request: ContractWriteRequest,
      options?: { userId?: string | null },
    ): Promise<SponsoredNetworkFeeEstimate> => {
      if (!isSponsored) {
        return SELF_FUNDED_NETWORK_FEE_ESTIMATE;
      }

      if (!alchemyGasPolicyId) {
        return {
          ...SPONSORSHIP_UNAVAILABLE_NETWORK_FEE_ESTIMATE,
          reason:
            "Gas sponsorship is enabled, but no Alchemy policy is configured.",
        };
      }

      const smartWalletClient = await getClientForChain({ id: targetChain.id });
      if (!smartWalletClient) {
        return {
          ...SPONSORSHIP_UNAVAILABLE_NETWORK_FEE_ESTIMATE,
          reason: "Smart wallet client is not ready.",
        };
      }

      // Prepare and price an *unsponsored* user operation. This deliberately
      // never requests paymaster sponsorship, so previewing the fee invokes no
      // Alchemy paymaster webhook and consumes no sponsorship budget — only a
      // real submit hits the paymaster.
      let unsponsoredOp: Record<string, unknown> | undefined;
      try {
        unsponsoredOp = (await smartWalletClient.prepareUserOperation(
          unsponsoredUserOperationRequest(request) as unknown as Parameters<
            typeof smartWalletClient.prepareUserOperation
          >[0],
        )) as Record<string, unknown>;
      } catch {
        unsponsoredOp = undefined;
      }

      const feeWei = unsponsoredOp
        ? userOperationFeeWei(unsponsoredOp)
        : undefined;
      const ethUsdPrice = publicClient
        ? await fetchEthUsdPrice(publicClient)
        : undefined;
      const feeUsd =
        feeWei !== undefined && ethUsdPrice !== undefined
          ? formatUsdFee(feeWei, ethUsdPrice)
          : "";

      // Ask our own meter (never the paymaster) whether this op would be
      // sponsored. When it can't answer (no backend, no userId, or a transient
      // error), optimistically assume sponsorship: the real submit will hit the
      // paymaster and gracefully fall back to self-funded if it is declined.
      const eligibility = unsponsoredOp
        ? await fetchSponsorshipEligibility(unsponsoredOp, options?.userId)
        : undefined;

      if (!eligibility || eligibility.status === "sponsored") {
        return SPONSORED_NETWORK_FEE_ESTIMATE;
      }

      return {
        kind: "self-funded",
        label: selfFundedLabel(feeUsd),
        ...(eligibilityFeeExtra(eligibility) ?? {}),
      };
    },
    [isSponsored, getClientForChain, publicClient],
  );

  const writeContract = useCallback(
    async (request: ContractWriteRequest): Promise<Hex> => {
      if (!isSponsored) {
        return await writeContractAsync(request);
      }

      if (!alchemyGasPolicyId) {
        throw new Error(
          "Gas sponsorship is enabled, but VITE_ALCHEMY_GAS_POLICY_ID is not set.",
        );
      }

      const smartWalletClient = await getClientForChain({ id: targetChain.id });
      if (!smartWalletClient) {
        throw new Error(
          "Smart wallet client is not ready. Check Privy smart wallet configuration for the active chain.",
        );
      }

      const uiOptions = {
        ...sponsoredTransactionUiOptions(
          request.functionName,
          request.uiOptions,
        ),
        showWalletUIs: request.uiOptions?.showWalletUIs,
      };

      // Privy's wrapped `sendTransaction` always applies the smart wallet's
      // configured paymaster and ignores a per-call `paymaster: false`. A
      // self-funded send therefore has to go through the underlying bundler
      // client's `sendUserOperation` (which honours `paymaster: false`) and
      // then resolve the transaction hash from the user-operation receipt.
      const sendSelfFunded = async (): Promise<Hex> => {
        const userOpHash = await smartWalletClient.sendUserOperation(
          unsponsoredUserOperationRequest(request) as unknown as Parameters<
            typeof smartWalletClient.sendUserOperation
          >[0],
        );
        const { receipt } = await smartWalletClient.waitForUserOperationReceipt(
          {
            hash: userOpHash,
          },
        );
        return receipt.transactionHash;
      };

      if (request.selfFunded) {
        // The fee preview already priced this as self-funded, so skip the
        // doomed sponsored attempt and pay from the smart wallet directly.
        return await sendSelfFunded();
      }

      try {
        return await smartWalletClient.sendTransaction(
          {
            to: request.address,
            value: 0n,
            data: contractWriteData(request),
            gas: request.gas,
          },
          { uiOptions },
        );
      } catch (error) {
        if (!isPaymasterError(error)) {
          throw error;
        }

        // Sponsorship failed (webhook declined, policy limits, etc.). Retry
        // self-funded through the same smart wallet so the participant identity
        // is unchanged; the smart wallet pays its own gas.
        return await sendSelfFunded();
      }
    },
    [isSponsored, getClientForChain, writeContractAsync],
  );

  return { writeContract, previewNetworkFee };
};
