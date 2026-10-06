import { FC } from "react";
import { IconButton, Stack, Typography, useTheme } from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";

import { StagedStatement } from "../state/UserVotes";
import StatementCardShell from "./StatementCardShell";
import SupportVoteControls from "./SupportVoteControls";
import { useCreditConversion } from "../hooks/useCreditConversion";

interface StagedStatementCardProps {
  staged: StagedStatement;
  onUnstage?: (tempId: string) => void;
  onUpdateSupport?: (tempId: string, newSupport: number) => void;
}

/**
 * Card for a locally staged statement that has not been committed on-chain yet.
 * These appear at the top of StatementList when `showStagedStatements` is true.
 */
const StagedStatementCard: FC<StagedStatementCardProps> = ({
  staged,
  onUnstage,
  onUpdateSupport,
}) => {
  const theme = useTheme();
  const { toCredits, toParts } = useCreditConversion();
  const initialSupportCredits = toCredits(staged.initialSupport);
  const leftSlot = (
    <Typography
      variant="caption"
      sx={{
        fontWeight: 600,
        fontSize: "0.6rem",
        lineHeight: 1.2,
        color: "warning.main",
        textAlign: "center",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
      }}
    >
      Pending
    </Typography>
  );

  const statsSlot = (
    <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 0.5 }}>
      {onUnstage && (
        <IconButton
          size="small"
          onClick={() => onUnstage(staged.tempId)}
          aria-label="Remove staged statement"
          sx={{ p: 0.25 }}
        >
          <DeleteOutlineIcon fontSize="small" color="action" />
        </IconButton>
      )}
    </Stack>
  );

  const voteControls = onUpdateSupport ? (
    <SupportVoteControls
      userSupport={initialSupportCredits}
      uncommittedSupport={true}
      onUserVoteChange={(newCreditSupport) =>
        onUpdateSupport(staged.tempId, toParts(newCreditSupport))
      }
      onClear={() => onUpdateSupport(staged.tempId, 0)}
      creditsTooltip={`This pending statement will use ${(Math.abs(initialSupportCredits) * (Math.abs(initialSupportCredits) + 1)) / 2} credits for ${initialSupportCredits} support`}
    />
  ) : undefined;

  return (
    <StatementCardShell
      leftSlot={leftSlot}
      text={staged.text}
      statsSlot={statsSlot}
      voteControls={voteControls}
      sx={{
        opacity: 0.85,
        borderLeft: "3.5px solid",
        borderColor:
          theme.custom.colors.stagedSupport[
            theme.palette.mode === "dark" ? "dark" : "light"
          ],
      }}
    />
  );
};

export default StagedStatementCard;
