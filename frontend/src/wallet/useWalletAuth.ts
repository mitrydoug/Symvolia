import { useCallback, useEffect } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useDisconnect } from "wagmi";
import { useActiveWallet } from "./useActiveWallet";

/**
 * The single wallet-facing hook for the rest of the app. It handles Privy auth
 * and wallet connection/disconnection and exposes a wallet-kind-agnostic view:
 * one `address` (the participant identity — a smart-wallet address for smart
 * wallets, otherwise the EOA) plus connection state. Consumers never need to
 * know what kind of wallet is connected.
 */
export const useWalletAuth = () => {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { address, activeWallet, kind } = useActiveWallet();
  const { disconnect: disconnectWagmi } = useDisconnect();

  // Email/passkey users get an embedded wallet that Privy creates (for new
  // users) or restores asynchronously *after* authentication, so an empty
  // `wallets` list is expected during that window. Logging out then would abort
  // wallet creation and leave new users permanently walletless.
  const usesEmbeddedWallet =
    user?.linkedAccounts.some(
      (account) =>
        account.type === "email" ||
        account.type === "passkey" ||
        (account.type === "wallet" && account.walletClientType === "privy"),
    ) ?? false;

  // Sign out if an authenticated external-wallet user has no connected wallet
  // (e.g. the wallet disconnected out-of-app). Gated on Privy's `walletsReady`,
  // not wagmi's status, which is briefly `disconnected` during the connect
  // window.
  useEffect(() => {
    if (!ready || !walletsReady || usesEmbeddedWallet) return;
    if (authenticated && wallets.length === 0) {
      void logout();
    }
  }, [
    ready,
    walletsReady,
    usesEmbeddedWallet,
    authenticated,
    wallets.length,
    logout,
  ]);

  const connect = useCallback(() => {
    // Open the Privy login modal; no-op if already authenticated.
    if (!ready || authenticated) return;
    login();
  }, [ready, authenticated, login]);

  const disconnect = useCallback(() => {
    // Tear down both wallet layers: disconnect the wallet + wagmi (clears an
    // external connection, which logout() leaves intact), then logout() to end
    // the session (the only thing that drops the embedded wallet).
    activeWallet?.disconnect();
    disconnectWagmi();
    void logout();
  }, [activeWallet, disconnectWagmi, logout]);

  return {
    address,
    kind,
    // "Stand by" while wallet state is unknown: Privy is initialising, or the
    // user is authenticated but the participant address hasn't resolved yet.
    // Consumers use it to hold loading state instead of showing "logged out".
    isLoading: !ready || (authenticated && !address),
    connect,
    disconnect,
  };
};
