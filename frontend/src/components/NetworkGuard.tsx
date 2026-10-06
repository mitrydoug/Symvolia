import { type FC, type PropsWithChildren, useCallback } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { Box, Button, Typography } from "@mui/material";
import { targetChain } from "../wagmiConfig";

/**
 * Blocks the UI with a prominent overlay when the connected wallet is on a
 * chain that doesn't match this deployment's target chain.  Offers a button
 * that triggers a wallet prompt to switch to the correct network.
 *
 * Renders children normally when:
 *  - no wallet is connected, OR
 *  - the wallet is already on the target chain.
 */
const NetworkGuard: FC<PropsWithChildren> = ({ children }) => {
  const { isConnected, chainId: walletChainId } = useAccount();
  const { switchChain, isPending, error } = useSwitchChain();

  const handleSwitch = useCallback(() => {
    switchChain({ chainId: targetChain.id });
  }, [switchChain]);

  const isWrongChain = isConnected && walletChainId !== targetChain.id;

  if (!isWrongChain) return <>{children}</>;

  return (
    <Box
      sx={{
        position: "fixed",
        inset: 0,
        zIndex: (theme) => theme.zIndex.modal + 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        bgcolor: "background.default",
        px: 3,
        textAlign: "center",
      }}
    >
      <Typography variant="h5" fontWeight="bold">
        Wrong Network
      </Typography>
      <Typography color="text.secondary">
        This app requires the <strong>{targetChain.name}</strong> network.
        Please switch your wallet to continue.
      </Typography>
      <Button
        variant="contained"
        size="large"
        onClick={handleSwitch}
        disabled={isPending}
      >
        {isPending ? "Switching…" : `Switch to ${targetChain.name}`}
      </Button>
      {error && (
        <Typography color="error" variant="body2" sx={{ maxWidth: 400 }}>
          Could not switch network. Please change the network manually in your
          wallet.
        </Typography>
      )}
    </Box>
  );
};

export default NetworkGuard;
