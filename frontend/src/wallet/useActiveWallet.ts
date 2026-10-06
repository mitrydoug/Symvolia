import { useMemo } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { isGasSponsorshipEnabled } from "@/wagmiConfig";
import { isAddress } from "./sponsoredWrite";
import type { WalletKind } from "./types";

type ConnectedWallet = ReturnType<typeof useWallets>["wallets"][number];

/**
 * Internal source of truth for "which wallet is active and how should the app
 * treat it". Classifies the connected wallet, derives the participant address
 * (the identity the rest of the app cares about), and decides whether the
 * active wallet can be gas-sponsored.
 *
 * Detection:
 * - The active signer is the wagmi account (`useAccount().address`). We match
 *   it against `useWallets()` to learn its `walletClientType` — `"privy"` means
 *   the Privy embedded wallet, anything else is an external/self-custodied
 *   wallet.
 * - A Privy smart wallet only exists for embedded users. We read its address
 *   straight off the user record (`usePrivy().user.smartWallet`) — the same
 *   address the smart wallet client transacts from, but available as soon as
 *   the user loads with no dependency on the async smart-wallet client build.
 *   When sponsorship is available for the deployment and the embedded wallet is
 *   active, the smart wallet becomes the participant identity and its
 *   transactions are sponsored.
 * - Not every embedded wallet has a smart wallet: whether one was created
 *   depends on the Privy app config at the time the user signed up. A user with
 *   no `smartWallet` simply falls through to the plain-EOA path below, so an
 *   embedded-but-not-smart user is never stuck with an undefined participant
 *   address.
 *
 * This is a module-internal hook — nothing outside `@/wallet` should import it.
 */
export const useActiveWallet = () => {
  const { user } = usePrivy();
  const { address: ownerAddress, status } = useAccount();
  const { wallets } = useWallets();
  // The smart wallet address off the user record: present as soon as the user
  // loads (no async client build) and equal to the address the smart wallet
  // client transacts from.
  const smartWalletAddress = user?.smartWallet?.address;

  return useMemo(() => {
    const activeWallet: ConnectedWallet | undefined = ownerAddress
      ? wallets.find(
          (w) => w.address.toLowerCase() === ownerAddress.toLowerCase(),
        )
      : undefined;

    const isEmbeddedActive = activeWallet?.walletClientType === "privy";
    // Sponsorship is only ever possible for an embedded wallet that actually
    // has a smart wallet, and only when the deployment has it enabled (env flag
    // + supported chain + policy). An embedded wallet with no smart wallet
    // falls through to the plain-EOA path below.
    const canSponsor =
      isGasSponsorshipEnabled &&
      isEmbeddedActive &&
      isAddress(smartWalletAddress);
    const isSponsored = canSponsor;

    // In sponsored mode the smart wallet is the identity; otherwise the EOA is.
    // Both addresses are available synchronously, so the participant address
    // resolves immediately with no loading window.
    const participantAddress = canSponsor ? smartWalletAddress : ownerAddress;
    console.log({
      isGasSponsorshipEnabled,
      isEmbeddedActive,
      canSponsor,
      participantAddress,
      smartWalletAddress,
      ownerAddress,
    });

    let kind: WalletKind = "none";
    if (ownerAddress) {
      if (!isEmbeddedActive) kind = "external";
      else if (canSponsor) kind = "smart";
      else kind = "embedded";
    }

    return {
      kind,
      address: isAddress(participantAddress) ? participantAddress : undefined,
      ownerAddress,
      smartWalletAddress,
      isSponsored,
      status,
      activeWallet,
    };
  }, [ownerAddress, wallets, smartWalletAddress, status]);
};
