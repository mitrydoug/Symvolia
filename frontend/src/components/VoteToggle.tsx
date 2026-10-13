import { ChangeEvent, FC, KeyboardEvent, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import ButtonBase from "@mui/material/ButtonBase";
import Popover from "@mui/material/Popover";
import InputBase from "@mui/material/InputBase";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import ArrowDropUpIcon from "@mui/icons-material/ArrowDropUp";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";

interface VoteToggleProps {
  userSupport: number;
  uncommittedSupport: boolean;
  onUserVoteChange: (newVoteCount: number) => void;
  direction?: "horizontal" | "vertical" | "compact";
}

/** Upper bound on |support| accepted from the free-form input. */
const MAX_SUPPORT_INPUT_DIGITS = 4;
/** Optional leading minus followed by up to MAX_SUPPORT_INPUT_DIGITS digits (may be partial while typing). */
const SUPPORT_INPUT_PATTERN = new RegExp(
  `^-?\\d{0,${MAX_SUPPORT_INPUT_DIGITS}}$`,
);

/** Parses a validated draft into a support value; empty or "-" means 0. */
const parseSupportInput = (draft: string): number => {
  const parsed = Number.parseInt(draft, 10);
  return Number.isSafeInteger(parsed) ? parsed : 0;
};

interface SupportButtonProps {
  label: string;
  onClick: () => void;
  variant: "increase" | "decrease";
  hasUncommittedChange: boolean;
}

const SupportButton: FC<SupportButtonProps> = ({
  label,
  onClick,
  variant,
  hasUncommittedChange,
}) => {
  const baseColor = variant === "increase" ? "#e8f5e9" : "#ffebee";
  const hoverColor = variant === "increase" ? "#c8e6c9" : "#ffcdd2";
  const textColor = variant === "increase" ? "#2e7d32" : "#c62828";
  const borderColor = hasUncommittedChange
    ? variant === "increase"
      ? "#2e7d32"
      : "#c62828"
    : "transparent";

  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        flex: 1,
        backgroundColor: baseColor,
        color: textColor,
        borderRadius: 1,
        px: 2,
        py: 0.5,
        fontWeight: 600,
        fontSize: "1rem",
        border: `2px solid ${borderColor}`,
        "&:hover": {
          backgroundColor: hoverColor,
        },
      }}
    >
      {label}
    </ButtonBase>
  );
};

const CompactVoteToggle: FC<Omit<VoteToggleProps, "direction">> = ({
  userSupport,
  uncommittedSupport,
  onUserVoteChange,
}) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const numberColor =
    userSupport > 0
      ? "success.main"
      : userSupport < 0
        ? "error.main"
        : "text.secondary";

  const openEditor = (target: HTMLElement) => {
    setDraft(userSupport === 0 ? "" : String(userSupport));
    setAnchorEl(target);
  };

  const closeEditor = (commit: boolean) => {
    if (commit) {
      const next = parseSupportInput(draft);
      if (next !== userSupport) onUserVoteChange(next);
    }
    setAnchorEl(null);
  };

  const handleDraftChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.trim();
    if (SUPPORT_INPUT_PATTERN.test(value)) setDraft(value);
  };

  const handleDraftKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      closeEditor(true);
    }
  };

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        borderRadius: 999,
        bgcolor: "action.hover",
        border: "1px solid",
        borderColor: "transparent",
        px: 0.75,
      }}
    >
      <ButtonBase
        aria-label="Increase support"
        onClick={() => onUserVoteChange(userSupport + 1)}
        sx={{
          width: 16,
          height: 22,
          borderRadius: 1,
          color: "text.secondary",
          "&:hover": { color: "success.main" },
        }}
      >
        <ArrowDropUpIcon sx={{ fontSize: 28 }} />
      </ButtonBase>
      <ButtonBase
        aria-label="Edit support"
        aria-haspopup="dialog"
        onClick={(e) => openEditor(e.currentTarget)}
        sx={{
          minWidth: 12,
          mx: 0.5,
          borderRadius: 1,
          "&:hover": { bgcolor: "action.selected" },
        }}
      >
        <Typography
          variant="body2"
          sx={{
            fontWeight: uncommittedSupport ? 700 : 600,
            textAlign: "center",
            color: numberColor,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {userSupport}
        </Typography>
      </ButtonBase>
      <ButtonBase
        aria-label="Decrease support"
        onClick={() => onUserVoteChange(userSupport - 1)}
        sx={{
          width: 16,
          height: 22,
          borderRadius: 1,
          color: "text.secondary",
          "&:hover": { color: "error.main" },
        }}
      >
        <ArrowDropDownIcon sx={{ fontSize: 28 }} />
      </ButtonBase>
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        // Clicking away applies the typed value; Escape discards it.
        onClose={(_e, reason) => closeEditor(reason !== "escapeKeyDown")}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        transformOrigin={{ vertical: "bottom", horizontal: "center" }}
        slotProps={{
          // Focus + select once the open transition finishes; focusing on
          // mount can be lost while the Popover sets up its focus trap.
          transition: {
            onEntered: () => {
              inputRef.current?.focus();
              inputRef.current?.select();
            },
          },
          paper: {
            sx: {
              // Popover positions via `top`, so lift with a negative margin to
              // leave room for the notch.
              mt: "-10px",
              px: 0.5,
              py: 0.25,
              overflow: "visible",
              // Notch pointing down at the vote number.
              "&::before": {
                content: '""',
                position: "absolute",
                bottom: -4,
                left: "50%",
                width: 8,
                height: 8,
                bgcolor: "background.paper",
                transform: "translateX(-50%) rotate(45deg)",
                boxShadow: "2px 2px 2px -1px rgba(0, 0, 0, 0.15)",
              },
            },
          },
        }}
      >
        <InputBase
          autoFocus
          inputRef={inputRef}
          value={draft}
          placeholder="0"
          onChange={handleDraftChange}
          onKeyDown={handleDraftKeyDown}
          onFocus={(e) => e.target.select()}
          inputProps={{
            inputMode: "numeric",
            "aria-label": "Support amount",
          }}
          sx={{
            fontSize: "0.875rem",
            "& .MuiInputBase-input": {
              width: 40,
              p: 0,
              textAlign: "center",
              fontVariantNumeric: "tabular-nums",
            },
          }}
        />
      </Popover>
    </Box>
  );
};

const VoteToggle: FC<VoteToggleProps> = ({
  userSupport,
  uncommittedSupport,
  onUserVoteChange,
  direction = "horizontal",
}) => {
  if (direction === "compact") {
    return (
      <CompactVoteToggle
        userSupport={userSupport}
        uncommittedSupport={uncommittedSupport}
        onUserVoteChange={onUserVoteChange}
      />
    );
  }

  if (direction === "vertical") {
    const numberColor =
      userSupport > 0
        ? "success.main"
        : userSupport < 0
          ? "error.main"
          : "text.secondary";

    return (
      <Stack alignItems="center" spacing={0}>
        <ButtonBase
          aria-label="Increase support"
          onClick={() => onUserVoteChange(userSupport + 1)}
          sx={{
            width: 32,
            height: 28,
            color: "text.secondary",
            "&:hover": { color: "success.main" },
          }}
        >
          <KeyboardArrowUpIcon sx={{ fontSize: 28 }} />
        </ButtonBase>
        <Typography
          variant="body1"
          sx={{
            fontWeight: 500,
            lineHeight: 1.2,
            color: numberColor,
          }}
        >
          {userSupport}
        </Typography>
        <ButtonBase
          aria-label="Decrease support"
          onClick={() => onUserVoteChange(userSupport - 1)}
          sx={{
            width: 32,
            height: 28,
            color: "text.secondary",
            "&:hover": { color: "error.main" },
          }}
        >
          <KeyboardArrowDownIcon sx={{ fontSize: 28 }} />
        </ButtonBase>
      </Stack>
    );
  }

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1}
      sx={{ width: "100%" }}
    >
      {/* Decrease button */}
      <SupportButton
        label="-1"
        onClick={() => onUserVoteChange(userSupport - 1)}
        variant="decrease"
        hasUncommittedChange={uncommittedSupport}
      />

      {/* Current support value */}
      <Typography
        variant="h4"
        sx={{ fontWeight: 400, minWidth: 60, textAlign: "center" }}
      >
        {userSupport}
      </Typography>

      {/* Increase button */}
      <SupportButton
        label="+1"
        onClick={() => onUserVoteChange(userSupport + 1)}
        variant="increase"
        hasUncommittedChange={uncommittedSupport}
      />
    </Stack>
  );
};

export default VoteToggle;
export { SupportButton };
