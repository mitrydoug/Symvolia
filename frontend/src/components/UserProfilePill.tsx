import React, { useEffect, useRef, useState } from "react";
import {
  Avatar,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Typography,
  keyframes,
  useTheme,
} from "@mui/material";
import VerifiedUserIcon from "@mui/icons-material/VerifiedUser";
import { useNavigate } from "react-router-dom";
import { useForumNavigate } from "../hooks/useForumNavigate";
import useUserIdentity from "@/hooks/useUserIdentity";
import { useUserVotes } from "../state/UserVotes";
import { useForum } from "../state/Forum";
import { FORUMS } from "./ChooseForumModal";
import { useUserRegistration } from "@/hooks/useUserRegistration";
import { toAlpha2, toDemonym } from "../countryCodeMap";
import { useCreditConversion } from "../hooks/useCreditConversion";
import AnimatedCounter from "./AnimatedCounter";
import IndeterminateCheckBoxIcon from "@mui/icons-material/IndeterminateCheckBox";
import { useWalletAuth } from "@/wallet";
import CommitConfirmationDialog from "./CommitConfirmationDialog";
import type { CommitPreview } from "../state/UserVotes";

const shimmer = keyframes`
  0% { opacity: 0.6; }
  50% { opacity: 1; }
  100% { opacity: 0.6; }
`;

// ── Coin icon SVG ────────────────────────────────────────────────────────────
const CoinIcon: React.FC<{ size?: number }> = ({ size = 16 }) => {
  const { light, main } = useTheme().custom.colors.credit;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="12" cy="12" r="10" fill={light} />
      <circle cx="12" cy="12" r="8" fill={main} />
      <text
        x="12"
        y="16.5"
        textAnchor="middle"
        fontSize="12"
        fontWeight="bold"
        fill="#FFFBEB"
        fontFamily="Inter, sans-serif"
      >
        C
      </text>
    </svg>
  );
};

const UserProfilePanel: React.FC = () => {
  const { disconnect } = useWalletAuth();
  const navigate = useForumNavigate();
  const rawNavigate = useNavigate();
  const { displayName, avatar } = useUserIdentity();
  const userVotes = useUserVotes();
  const { isUserVerified } = userVotes;
  const { nationality, isRegistered } = useUserRegistration();
  const { name: forumName } = useForum();
  const { toCredits } = useCreditConversion();
  const forum = FORUMS[forumName];

  const alpha2 = nationality ? toAlpha2(nationality) : null;

  const credits = isUserVerified
    ? toCredits(userVotes.state?.staged?.credits ?? 0)
    : null;
  const hasStagedChanges = isUserVerified
    ? (userVotes.state?.hasStagedChanges ?? false)
    : false;
  const commitBusy = isUserVerified
    ? userVotes.state?.commitStatus !== undefined &&
      userVotes.state?.commitStatus !== "idle"
    : false;
  const commitChanges = isUserVerified ? userVotes.commitChanges : () => {};
  const previewCommitChanges = isUserVerified
    ? userVotes.previewCommitChanges
    : undefined;
  const resetChanges = isUserVerified ? userVotes.resetChanges : () => {};
  const hasEnoughCredits = isUserVerified
    ? (userVotes.state?.hasEnoughCredits ?? true)
    : true;

  const stagedStatementCount = isUserVerified
    ? (userVotes.state?.staged?.stagedStatements.length ?? 0)
    : 0;
  const stagedSupportCount = isUserVerified
    ? (userVotes.state?.staged?.supportAdjustments.size ?? 0)
    : 0;

  const isOverBudget = credits !== null && credits < 0;
  const [commitDialogOpen, setCommitDialogOpen] = useState(false);
  const [commitPreview, setCommitPreview] = useState<CommitPreview | null>(
    null,
  );
  const [commitPreviewLoading, setCommitPreviewLoading] = useState(false);
  const [commitPreviewError, setCommitPreviewError] = useState<string>();
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  // Capture the latest preview function in a ref so the effect below runs
  // exactly once per dialog open, instead of re-firing every time the callback
  // identity churns (e.g. Privy handing back a fresh smart-wallet client on its
  // own re-render cadence). Staged changes can't change while the modal is
  // open, so a single preview is correct.
  const previewCommitChangesRef = useRef(previewCommitChanges);
  previewCommitChangesRef.current = previewCommitChanges;

  useEffect(() => {
    if (!commitDialogOpen) return;
    const runPreview = previewCommitChangesRef.current;
    if (!runPreview) return;

    let isCancelled = false;
    setCommitPreview(null);
    setCommitPreviewError(undefined);
    setCommitPreviewLoading(true);

    void runPreview()
      .then((preview) => {
        if (isCancelled) return;
        if (preview) {
          setCommitPreview(preview);
        } else {
          setCommitPreviewError("No staged changes are ready to commit.");
        }
      })
      .catch((error: unknown) => {
        if (isCancelled) return;
        // Show a friendly message; the raw error (often serialized JSON from
        // viem/Alchemy) is logged for debugging rather than shown to the user.
        console.error("Failed to preview commit network fee", error);
        setCommitPreviewError("Unable to check the network fee.");
      })
      .finally(() => {
        if (!isCancelled) setCommitPreviewLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [commitDialogOpen]);

  return (
    <>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          borderRadius: 4,
          bgcolor: "action.hover",
          px: 2,
          py: 2,
        }}
      >
        {/* Avatar + name row */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
          }}
        >
          <Avatar src={avatar ?? undefined} sx={{ width: 48, height: 48 }} />

          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" fontWeight={700} noWrap>
              {displayName}
            </Typography>

            {/* Verified / Not Verified status */}
            {!isRegistered && (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.75,
                }}
              >
                <IndeterminateCheckBoxIcon
                  sx={{ fontSize: 16, color: "text.disabled" }}
                />
                <Typography variant="body2" color="text.secondary">
                  Not verified
                </Typography>
              </Box>
            )}
            {isRegistered && (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.75,
                }}
              >
                {alpha2 ? (
                  <img
                    src={`./flags/${alpha2}.svg`}
                    alt={`${nationality} flag`}
                    style={{
                      height: "1rem",
                      width: "auto",
                      borderRadius: "2px",
                    }}
                  />
                ) : (
                  <img
                    src="./earth.png"
                    alt="Earth"
                    style={{
                      height: "1rem",
                      width: "auto",
                      borderRadius: "2px",
                    }}
                  />
                )}
                <Typography variant="body2" color="text.secondary">
                  Verified
                </Typography>
                <VerifiedUserIcon
                  sx={{ fontSize: 16, color: "success.main" }}
                />
              </Box>
            )}
          </Box>
        </Box>

        {/* Credits / Join In section */}
        {!isRegistered && (
          <>
            <Divider sx={{ my: 1.5 }} />
            <Button
              variant="contained"
              fullWidth
              onClick={() => void rawNavigate("/verify")}
              sx={{
                borderRadius: 2,
                fontWeight: 700,
                textTransform: "none",
              }}
            >
              Join In
            </Button>
          </>
        )}
        {isRegistered && !isUserVerified && forum?.countryCode && (
          <>
            <Divider sx={{ my: 1.5 }} />
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ textAlign: "center" }}
            >
              Only {toDemonym(forum.countryCode) ?? forum.label} citizens can
              participate in this Forum.
            </Typography>
          </>
        )}
        {credits !== null && (
          <>
            <Divider sx={{ my: 1.5 }} />
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 0.75,
                ...(isOverBudget && {
                  bgcolor: "error.main",
                  color: "error.contrastText",
                  borderRadius: 100,
                  px: 1.5,
                  py: 0.25,
                }),
              }}
            >
              <CoinIcon size={20} />
              <AnimatedCounter
                value={credits}
                typographyProps={{
                  variant: "body1",
                  fontWeight: 700,
                  sx: {
                    fontVariantNumeric: "tabular-nums",
                    color: "inherit",
                  },
                }}
              />
              <Typography
                variant="body2"
                color={isOverBudget ? "inherit" : "text.secondary"}
              >
                Credits
              </Typography>
            </Box>

            {/* Lock It In + Reset buttons */}
            <Box sx={{ display: "flex", gap: 1, mt: 1.5 }}>
              <Button
                variant="contained"
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  setCommitDialogOpen(true);
                }}
                disabled={!hasStagedChanges || commitBusy || !hasEnoughCredits}
                sx={{
                  flex: 1,
                  borderRadius: 2,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  ...(hasStagedChanges && !commitBusy
                    ? {
                        animation: `${shimmer} 1.5s ease-in-out infinite`,
                      }
                    : {}),
                }}
              >
                Lock it in!
              </Button>
              <Button
                variant="text"
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  setResetDialogOpen(true);
                }}
                disabled={!hasStagedChanges || commitBusy}
                sx={{
                  textTransform: "none",
                  color: "text.secondary",
                  fontWeight: 500,
                  minWidth: 0,
                  px: 1.5,
                }}
              >
                Reset
              </Button>
            </Box>
          </>
        )}

        <Divider sx={{ my: 1.5 }} />

        <Button
          fullWidth
          variant="text"
          color="inherit"
          onClick={() => void navigate("/profile")}
          sx={{
            fontWeight: 600,
            textTransform: "none",
            color: "text.secondary",
          }}
        >
          Settings
        </Button>

        <Button
          fullWidth
          variant="text"
          color="inherit"
          onClick={(e) => {
            e.stopPropagation();
            disconnect();
          }}
          sx={{
            fontWeight: 600,
            textTransform: "none",
            color: "text.secondary",
          }}
        >
          Disconnect
        </Button>
      </Box>

      <CommitConfirmationDialog
        open={commitDialogOpen}
        statementCount={stagedStatementCount}
        supportAdjustmentCount={stagedSupportCount}
        networkFee={commitPreview?.networkFee ?? null}
        isNetworkFeeLoading={commitPreviewLoading}
        networkFeeError={commitPreviewError}
        onClose={() => setCommitDialogOpen(false)}
        onConfirm={() => {
          setCommitDialogOpen(false);
          void commitChanges({
            selfFunded: commitPreview?.networkFee.kind === "self-funded",
          });
        }}
      />

      {/* Reset confirmation dialog */}
      <Dialog open={resetDialogOpen} onClose={() => setResetDialogOpen(false)}>
        <DialogTitle>Reset staged changes?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {stagedStatementCount > 0 && stagedSupportCount > 0
              ? `You will lose ${stagedStatementCount} staged statement${stagedStatementCount !== 1 ? "s" : ""} and ${stagedSupportCount} support adjustment${stagedSupportCount !== 1 ? "s" : ""}.`
              : stagedStatementCount > 0
                ? `You will lose ${stagedStatementCount} staged statement${stagedStatementCount !== 1 ? "s" : ""}.`
                : `You will lose ${stagedSupportCount} support adjustment${stagedSupportCount !== 1 ? "s" : ""}.`}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetDialogOpen(false)}>Cancel</Button>
          <Button
            color="error"
            onClick={() => {
              resetChanges();
              setResetDialogOpen(false);
            }}
          >
            Reset
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default UserProfilePanel;
