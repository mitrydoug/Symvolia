import { FC } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import ButtonBase from "@mui/material/ButtonBase";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import ArrowDropUpIcon from "@mui/icons-material/ArrowDropUp";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import CloseIcon from "@mui/icons-material/Close";

interface VoteToggleProps {
  userSupport: number;
  uncommittedSupport: boolean;
  onUserVoteChange: (newVoteCount: number) => void;
  direction?: "horizontal" | "vertical" | "compact";
  /**
   * When provided (compact variant), renders an integrated clear (×) segment
   * on the left of the pill. Its width is reserved even when hidden so the
   * −/+ controls never shift.
   */
  onClear?: () => void;
}

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

const VoteToggle: FC<VoteToggleProps> = ({
  userSupport,
  uncommittedSupport,
  onUserVoteChange,
  direction = "horizontal",
  onClear,
}) => {
  if (direction === "compact") {
    const numberColor =
      userSupport > 0
        ? "success.main"
        : userSupport < 0
          ? "error.main"
          : "text.secondary";
    const canClear = Boolean(onClear);
    const showClear = canClear && userSupport !== 0;

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
        {showClear && (
          <Box
            sx={{
              width: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <ButtonBase
              aria-label="Clear support"
              onClick={onClear}
              sx={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                color: "text.disabled",
                "&:hover": { color: "text.primary" },
              }}
            >
              <CloseIcon sx={{ fontSize: 12 }} />
            </ButtonBase>
          </Box>
        )}
        <ButtonBase
          aria-label="Decrease support"
          onClick={() => onUserVoteChange(userSupport - 1)}
          sx={{
            width: 14,
            height: 22,
            borderRadius: 1,
            color: "text.secondary",
            "&:hover": { color: "error.main" },
          }}
        >
          <ArrowDropDownIcon sx={{ fontSize: 24 }} />
        </ButtonBase>
        <Typography
          variant="body2"
          sx={{
            fontWeight: uncommittedSupport ? 700 : 600,
            minWidth: 12,
            mx: 0.5,
            textAlign: "center",
            color: numberColor,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {userSupport}
        </Typography>
        <ButtonBase
          aria-label="Increase support"
          onClick={() => onUserVoteChange(userSupport + 1)}
          sx={{
            width: 14,
            height: 22,
            borderRadius: 1,
            color: "text.secondary",
            "&:hover": { color: "success.main" },
          }}
        >
          <ArrowDropUpIcon sx={{ fontSize: 24 }} />
        </ButtonBase>
      </Box>
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
