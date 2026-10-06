import {
  Alert,
  Box,
  Button,
  Checkbox,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import { useEffect, useState } from "react";
import type { SponsoredNetworkFeeEstimate } from "@/wallet";

type CommitConfirmationDialogProps = {
  open: boolean;
  statementCount: number;
  supportAdjustmentCount: number;
  /**
   * When set, the staged batch exceeds the user's on-chain statement allowance
   * and would revert on submit. Shown as a warning and blocks confirmation.
   */
  allowanceWarning?: string | null;
  networkFee: SponsoredNetworkFeeEstimate | null;
  isNetworkFeeLoading: boolean;
  networkFeeError?: string;
  onClose: () => void;
  onConfirm: () => void;
};

const CommitConfirmationDialog = ({
  open,
  statementCount,
  supportAdjustmentCount,
  allowanceWarning,
  networkFee,
  isNetworkFeeLoading,
  networkFeeError,
  onClose,
  onConfirm,
}: CommitConfirmationDialogProps) => {
  const [feeAcknowledged, setFeeAcknowledged] = useState(false);
  // Reset the acknowledgement whenever the dialog closes so a fresh open always
  // starts unchecked.
  useEffect(() => {
    if (!open) setFeeAcknowledged(false);
  }, [open]);

  const networkFeeValue = isNetworkFeeLoading
    ? "Checking..."
    : networkFeeError
      ? "Couldn't estimate"
      : networkFee?.label || "Not checked";
  // Self-funded transactions charge the user's own wallet, so require an
  // explicit fee acknowledgement before confirming.
  const requiresFeeAcknowledgement = networkFee?.kind === "self-funded";
  const canConfirm =
    !allowanceWarning &&
    !isNetworkFeeLoading &&
    !networkFeeError &&
    networkFee !== null &&
    networkFee.kind !== "unavailable" &&
    (!requiresFeeAcknowledgement || feeAcknowledged);
  // A self-funded estimate that carries a warning or reason means sponsorship
  // was expected but failed (paymaster declined or errored). External-wallet
  // users are self-funded by design and carry neither, so they keep the normal
  // confirmation wording.
  const isSponsorshipFallback =
    networkFee?.kind === "self-funded" &&
    Boolean(networkFee.warning || networkFee.reason);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ pb: 1.25 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              bgcolor: "primary.main",
              color: "primary.contrastText",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <SendRoundedIcon fontSize="small" />
          </Box>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 600, mb: 0.5 }}>
              Submit your changes?
            </Typography>
          </Box>
        </Stack>
      </DialogTitle>
      <DialogContent sx={{ pt: 0 }}>
        <Stack spacing={2}>
          {allowanceWarning && (
            <Alert severity="warning" sx={{ borderRadius: 2 }}>
              {allowanceWarning}
            </Alert>
          )}
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            Details
          </Typography>
          <Box
            sx={{
              borderRadius: 2.5,
              px: 2,
              py: 1.5,
              bgcolor: "action.hover",
              border: "1px solid",
              borderColor: "divider",
            }}
          >
            <Stack spacing={1.25}>
              <Stack spacing={1} divider={<Divider flexItem />}>
                <Stack direction="row" justifyContent="space-between" gap={2}>
                  <Typography variant="body2" color="text.secondary">
                    Statements added
                  </Typography>
                  <Typography
                    variant="body2"
                    fontWeight={700}
                    textAlign="right"
                  >
                    {statementCount}
                  </Typography>
                </Stack>

                <Stack direction="row" justifyContent="space-between" gap={2}>
                  <Typography variant="body2" color="text.secondary">
                    Support changes
                  </Typography>
                  <Typography
                    variant="body2"
                    fontWeight={700}
                    textAlign="right"
                  >
                    {supportAdjustmentCount}
                  </Typography>
                </Stack>

                <Stack direction="row" justifyContent="space-between" gap={2}>
                  <Typography variant="body2" color="text.secondary">
                    Network fee
                  </Typography>
                  <Stack
                    direction="row"
                    spacing={0.5}
                    alignItems="center"
                    justifyContent="flex-end"
                  >
                    <Typography
                      variant="body2"
                      fontWeight={700}
                      textAlign="right"
                    >
                      {networkFeeValue}
                    </Typography>
                    {!isNetworkFeeLoading && networkFee?.warning && (
                      <Tooltip title={networkFee.warning}>
                        <WarningAmberRoundedIcon
                          fontSize="small"
                          sx={{ color: "warning.main", cursor: "help" }}
                          aria-label={networkFee.warning}
                        />
                      </Tooltip>
                    )}
                  </Stack>
                </Stack>
              </Stack>

              {networkFee?.kind === "unavailable" && networkFee.reason && (
                <Typography variant="caption" color="error">
                  {networkFee.reason}
                </Typography>
              )}
              {networkFee?.kind === "self-funded" && networkFee.reason && (
                <Typography variant="caption" color="text.secondary">
                  {networkFee.reason}
                </Typography>
              )}
              {networkFeeError && (
                <Typography variant="caption" color="error">
                  We couldn&apos;t estimate the network fee. Please try again.
                </Typography>
              )}
            </Stack>
          </Box>

          {isSponsorshipFallback && (
            <Alert severity="warning" sx={{ borderRadius: 2 }}>
              {networkFee?.warning ||
                networkFee?.reason ||
                "This transaction cannot be sponsored by Symvolia."}{" "}
              Click Continue to proceed with a self-funded transaction, or try
              again later.
            </Alert>
          )}

          {requiresFeeAcknowledgement && (
            <FormControlLabel
              control={
                <Checkbox
                  checked={feeAcknowledged}
                  onChange={(event) => setFeeAcknowledged(event.target.checked)}
                  size="small"
                  sx={{ py: 0 }}
                />
              }
              label={
                <Typography variant="body2" color="text.secondary">
                  I understand I will pay a small network fee (&lt; $0.01) for
                  this action.
                </Typography>
              }
              sx={{ alignItems: "flex-start", m: 0, gap: 1 }}
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, pt: 1.5 }}>
        <Button onClick={onClose} sx={{ textTransform: "none" }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={onConfirm}
          disabled={!canConfirm}
          sx={{ textTransform: "none", fontWeight: 700 }}
        >
          Submit
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CommitConfirmationDialog;
