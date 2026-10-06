import { FC, memo, ReactNode, useCallback, useMemo } from "react";
import {
  Box,
  ButtonBase,
  Chip,
  CircularProgress,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import MergeIcon from "@mui/icons-material/Merge";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { useNavigate } from "react-router-dom";

import { useForumNavigate } from "../hooks/useForumNavigate";
import { useWalletAuth } from "@/wallet";

import {
  SupportAdjustmentType,
  useStatementSupport,
  useUserVerification,
} from "../state/UserVotes";
import StatementCardShell from "./StatementCardShell";
import SupportVoteControls from "./SupportVoteControls";
import { useReadContract } from "wagmi";
import { useBlockSync } from "../hooks/useBlockSync";
import { useForum, FORUM_ABI } from "../state/Forum";
import { useCreditConversion } from "../hooks/useCreditConversion";
import { supportCreditsToAllocatedCredits } from "../util";
import {
  AVG_BLOCK_TIME,
  PERIODS_BACK,
  PERIOD_SECONDS,
} from "../hooks/useHistoricalSupport";

const LOOK_BACK_BLOCKS = BigInt(
  Math.floor((PERIODS_BACK * PERIOD_SECONDS) / AVG_BLOCK_TIME),
);

interface Statement {
  id: bigint;
  text: string;
  createdTimestamp: bigint;
  support: bigint;
  rank: bigint;
  peakRank: bigint;
}

/**
 * Format a number to 3 significant digits with a suffix (k, m, b, t).
 * Examples: 120 -> "120", 1000 -> "1k", 3220 -> "3.22k"
 */
const formatSupport = (value: number): string => {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (abs < 1000) return `${sign}${abs}`;

  const suffixes = ["", "k", "m", "b", "t"];
  const tier = Math.floor(Math.log10(abs) / 3);
  const suffix = suffixes[tier] ?? `e${tier * 3}`;
  const scaled = abs / Math.pow(10, tier * 3);

  // 3 significant digits
  const digits = 3 - Math.floor(Math.log10(scaled)) - 1;
  const formatted = Number(scaled.toFixed(Math.max(0, digits))).toString();

  return `${sign}${formatted}${suffix}`;
};

/** Scale font size down for 2- and 3-digit rank numbers. */
const rankFontSize = (rank: number): string => {
  if (rank >= 100) return "1.2rem";
  if (rank >= 10) return "1.6rem";
  return "2rem";
};

/** Color for top-3 rank badges (gold, silver, bronze). */
const rankColor = (rank: number): string | undefined => {
  if (rank === 1) return "#D4A017";
  if (rank === 2) return "#8E8E93";
  if (rank === 3) return "#A0522D";
  return undefined;
};

const peakRankIcon = (rank: number): string => {
  if (rank === 1) return "🏆";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return "⛰️";
};

const peakRankIconSize = (rank: number): number => {
  if (rank === 2 || rank === 3) return 17;
  return 14;
};

const clampPercent = (value: number): number =>
  Math.max(0, Math.min(100, value));

const rankingProgressPercent = (
  supportParts: number,
  thresholdParts: number,
): number => {
  if (thresholdParts <= 0) return supportParts > 0 ? 100 : 0;
  return clampPercent((Math.max(0, supportParts) / thresholdParts) * 100);
};

const RankingProgressRing: FC<{ value: number }> = ({ value }) => {
  const roundedValue = Math.round(value);

  return (
    <Tooltip title={`${roundedValue}% of the support needed to rank`} arrow>
      <Box
        sx={{
          position: "relative",
          width: 64,
          height: 64,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <CircularProgress
          variant="determinate"
          value={100}
          size={64}
          thickness={4}
          sx={{
            color: (theme) =>
              theme.palette.mode === "dark"
                ? "rgba(255, 255, 255, 0.18)"
                : "rgba(0, 0, 0, 0.06)",
            position: "absolute",
          }}
        />
        <CircularProgress
          variant="determinate"
          value={roundedValue}
          size={64}
          thickness={4}
          sx={{ color: "primary.main", position: "absolute" }}
        />
        <Typography
          variant="caption"
          sx={{
            fontWeight: 700,
            fontSize: "0.875rem",
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {roundedValue}%
        </Typography>
      </Box>
    </Tooltip>
  );
};

/**
 * Metallic medal fills for the top three ranks. Each gradient alternates
 * light/dark bands so the digit reads as a reflective metal surface, paired
 * with a darker outline of the same hue family.
 */
const MEDAL_STYLES: Record<
  number,
  {
    gradient: string;
    stroke: string;
    strokeWidth?: string;
    fontWeight?: number;
    blur?: string;
  }
> = {
  // Gold
  1: {
    gradient:
      "linear-gradient(180deg, #FCEFB4 0%, #E6B325 22%, #FFE07A 42%, #C9962B 60%, #F7DE8B 78%, #A9781F 100%)",
    stroke: "rgba(111, 76, 14, 0.9)",
    strokeWidth: "1.5px",
    fontWeight: 550,
    blur: "0.5px",
  },
  // Silver
  2: {
    gradient:
      "linear-gradient(180deg, #FDFDFE 0%, #C3C8CF 22%, #FFFFFF 42%, #9AA1A9 60%, #E6E9ED 78%, #7E858E 100%)",
    stroke: "rgba(88, 94, 102, 0.9)",
    strokeWidth: "1.5px",
    fontWeight: 550,
    blur: "0.5px",
  },
  // Bronze — a lighter weight keeps the darker outline from crowding the
  // glyph's counters and losing definition.
  3: {
    gradient:
      "linear-gradient(180deg, #F4D3AF 0%, #C67C46 22%, #EFB184 42%, #9A5528 60%, #DFA06E 78%, #78411E 100%)",
    stroke: "rgba(88, 50, 25, 0.9)",
    strokeWidth: "1px",
    fontWeight: 550,
    blur: "0.5px",
  },
};

/**
 * Rank number. The top three ranks get a metallic "medal" fill (gold / silver /
 * bronze) with a soft same-hue outline; every other rank renders as a plain
 * coloured number.
 */
const RankNumber: FC<{
  rank: number;
  color: string;
  fontSize: string;
  changeIndicator?: ReactNode;
}> = ({ rank, color, fontSize, changeIndicator }) => {
  const medal = MEDAL_STYLES[rank];
  const medalFontWeight = medal?.fontWeight ?? 700;
  const medalBlur = medal?.blur ?? ".5px";
  const medalStrokeWidth = medal?.strokeWidth ?? "2.5px";

  return (
    <Stack alignItems="center" spacing={0.75}>
      {medal ? (
        <Box sx={{ position: "relative", display: "inline-flex" }}>
          {/*
            Border layer: a copy of the digit drawn as an outline only
            (transparent fill + stroke), sitting *behind* the gradient copy.
            Because it is a separate element underneath, its stroke can never
            bleed into or muddy the metal fill on top — the front copy covers the
            entire interior, leaving just the softened outer edge showing.
          */}
          <Typography
            aria-hidden
            variant="h4"
            sx={{
              position: "absolute",
              inset: 0,
              fontWeight: medalFontWeight,
              fontSize,
              lineHeight: 1.1,
              color: "transparent",
              WebkitTextFillColor: "transparent",
              WebkitTextStroke: `${medalStrokeWidth} ${medal.stroke}`,
              // Soften the outline a smidge. The blur only touches this back
              // layer, so the gradient fill on top stays crisp.
              filter: `blur(${medalBlur})`,
              pointerEvents: "none",
            }}
          >
            {rank}
          </Typography>
          {/* Gradient layer: the visible metallic number on top. */}
          <Typography
            variant="h4"
            sx={{
              position: "relative",
              fontWeight: medalFontWeight,
              fontSize,
              lineHeight: 1.1,
              color: "transparent",
              background: medal.gradient,
              backgroundClip: "text",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            {rank}
          </Typography>
        </Box>
      ) : (
        <Typography
          variant="h4"
          sx={{
            fontWeight: 700,
            fontSize,
            lineHeight: 1.1,
            color,
          }}
        >
          {rank}
        </Typography>
      )}
      {changeIndicator}
    </Stack>
  );
};

type StatementCardProps = {
  statement: Statement;
  isBookmarked?: boolean;
  onToggleBookmark?: (statementId: number) => void;
  onSwitchSupport?: (statementId: number) => void;
};

const StatementCardComponent: FC<StatementCardProps> = ({
  statement,
  isBookmarked,
  onToggleBookmark,
  onSwitchSupport,
}) => {
  const navigate = useForumNavigate();
  const rawNavigate = useNavigate();
  const theme = useTheme();
  const stagedSupportColor =
    theme.custom.colors.stagedSupport[
      theme.palette.mode === "dark" ? "dark" : "light"
    ];
  const handleCardClick = useCallback(() => {
    void navigate(`/statement/${statement.id}`);
  }, [navigate, statement.id]);
  const { isUserVerified, isVerifiedLoading } = useUserVerification();
  const {
    supportParts: statementSupportParts,
    hasAdjustment: statementHasAdjustment,
    getOnChainSupport,
    dispatch,
  } = useStatementSupport(Number(statement.id));
  const { address, connect, isLoading: isWalletLoading } = useWalletAuth();
  const { forumContractAddress } = useForum();
  const { toCredits, toParts } = useCreditConversion();

  const { blockNumber } = useBlockSync(() => {});

  const { data: historicalData } = useReadContract({
    address: forumContractAddress,
    abi: FORUM_ABI,
    functionName: "getStatementsById",
    args: [[statement.id]],
    blockNumber: blockNumber ? blockNumber - LOOK_BACK_BLOCKS : undefined,
    query: {
      enabled: !!blockNumber,
      placeholderData: (prev) => prev,
    },
  });

  const { data: rankingThreshold } = useReadContract({
    address: forumContractAddress,
    abi: FORUM_ABI,
    functionName: "getRankingThreshold",
    query: {
      enabled: statement.rank < 0n,
    },
  });

  const statementOneWeekAgo = historicalData
    ? (historicalData[0] as Statement)
    : null;

  const currentRank = statement.rank >= 0n ? Number(statement.rank) + 1 : null;
  const lastWeekRank =
    statementOneWeekAgo && statementOneWeekAgo.rank >= 0n
      ? Number(statementOneWeekAgo.rank) + 1
      : null;

  // Rank change: positive means improved (moved up), negative means dropped
  const rankChange =
    lastWeekRank !== null && currentRank !== null
      ? lastWeekRank - currentRank
      : null;

  const userSupportParts = isUserVerified ? statementSupportParts : 0;
  const userSupport = toCredits(userSupportParts);
  const hasUncommittedSupport = isUserVerified ? statementHasAdjustment : false;

  const handleSupportChange = useCallback(
    (newCreditSupport: number) => {
      if (!isUserVerified) return;
      const onChainParts = getOnChainSupport(Number(statement.id));
      const onChainCredits = toCredits(onChainParts);
      const adjustment =
        newCreditSupport === 0
          ? {
              value: 0,
              adjustmentType: SupportAdjustmentType.SetTo,
            }
          : {
              value: toParts(newCreditSupport - onChainCredits),
              adjustmentType: SupportAdjustmentType.Delta,
            };
      dispatch({
        type: "STAGE_USER_SUPPORT",
        payload: {
          statementId: statement.id,
          adjustment,
        },
      });
    },
    [
      isUserVerified,
      getOnChainSupport,
      toCredits,
      toParts,
      dispatch,
      statement.id,
    ],
  );

  // Remove any staged adjustment for this statement, reverting it to its
  // on-chain support. Staging a zero Delta collapses to "no change", which the
  // reducer treats as clearing the adjustment.
  const handleClearStaged = useCallback(() => {
    if (!isUserVerified) return;
    dispatch({
      type: "STAGE_USER_SUPPORT",
      payload: {
        statementId: statement.id,
        adjustment: {
          value: 0,
          adjustmentType: SupportAdjustmentType.Delta,
        },
      },
    });
  }, [isUserVerified, dispatch, statement.id]);

  const peakRank =
    statement.peakRank >= 0n ? Number(statement.peakRank) + 1 : null;

  const rankingProgress =
    rankingThreshold !== undefined
      ? rankingProgressPercent(
          Number(statement.support),
          Number(rankingThreshold),
        )
      : null;

  const globalSupport = toCredits(Number(statement.support));

  const isHotRankChange =
    rankChange !== null &&
    lastWeekRank !== null &&
    rankChange > 0 &&
    rankChange / lastWeekRank >= 0.25;

  const card = useMemo(() => {
    const rankChangeIndicator =
      rankChange !== null && rankChange !== 0 ? (
        <Tooltip
          title={`Recently moved ${rankChange > 0 ? "up" : "down"} ${Math.abs(rankChange)} ${Math.abs(rankChange) === 1 ? "rank" : "ranks"}`}
          arrow
        >
          <Typography
            variant="body2"
            sx={{
              fontWeight: 600,
              fontSize: "0.95rem",
              color: isHotRankChange
                ? "warning.main"
                : rankChange > 0
                  ? "success.main"
                  : "error.main",
              lineHeight: 1,
            }}
          >
            {isHotRankChange ? (
              <Box
                component="span"
                sx={{
                  fontSize: "1.15em",
                  lineHeight: 1,
                  verticalAlign: "-0.04em",
                }}
              >
                🔥
              </Box>
            ) : rankChange > 0 ? (
              "▲"
            ) : (
              "▼"
            )}
            {Math.abs(rankChange)}
          </Typography>
        </Tooltip>
      ) : null;

    const leftSlot =
      currentRank !== null ? (
        <RankNumber
          rank={currentRank}
          color={rankColor(currentRank) ?? "text.primary"}
          fontSize={rankFontSize(currentRank)}
          changeIndicator={rankChangeIndicator}
        />
      ) : (
        <Stack alignItems="center" spacing={0.75}>
          {rankingProgress !== null ? (
            <RankingProgressRing value={rankingProgress} />
          ) : (
            <Typography
              variant="caption"
              sx={{
                fontWeight: 600,
                fontSize: "0.6rem",
                lineHeight: 1.2,
                color: "text.disabled",
                textAlign: "center",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Not
              <br />
              Ranked
            </Typography>
          )}
        </Stack>
      );

    const statsSlot = (
      <Stack
        direction="row"
        alignItems="flex-start"
        spacing={2}
        sx={{ mt: 0.1 }}
      >
        <Stack alignItems="center" spacing={0.25}>
          <Box sx={{ height: 24, display: "flex", alignItems: "center" }}>
            <Tooltip title={`${globalSupport} total support`} arrow>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 600,
                  color: "text.secondary",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {formatSupport(globalSupport)}
              </Typography>
            </Tooltip>
          </Box>
        </Stack>

        {peakRank !== null && (
          <Stack alignItems="center" spacing={0.25}>
            <Box sx={{ height: 24, display: "flex", alignItems: "center" }}>
              <Tooltip title={`Peak rank: #${peakRank}`} arrow>
                <Stack direction="row" alignItems="center" spacing={0.25}>
                  <Typography
                    sx={{ fontSize: peakRankIconSize(peakRank), lineHeight: 1 }}
                  >
                    {peakRankIcon(peakRank)}
                  </Typography>
                  {peakRank > 3 && (
                    <Typography variant="body2" color="text.secondary">
                      {peakRank}
                    </Typography>
                  )}
                </Stack>
              </Tooltip>
            </Box>
          </Stack>
        )}
      </Stack>
    );

    const bookmarkSlot = onToggleBookmark ? (
      <IconButton
        size="small"
        onClick={() => onToggleBookmark(Number(statement.id))}
        aria-label={isBookmarked ? "Unstar" : "Star"}
        sx={{ p: 0.25 }}
      >
        {isBookmarked ? (
          <StarIcon sx={{ fontSize: 22, color: "#E8C84A" }} />
        ) : (
          <StarBorderIcon sx={{ fontSize: 22, color: "text.secondary" }} />
        )}
      </IconButton>
    ) : undefined;

    const voteControls = isUserVerified ? (
      <SupportVoteControls
        userSupport={userSupport}
        uncommittedSupport={hasUncommittedSupport}
        onUserVoteChange={handleSupportChange}
        onClear={() => handleSupportChange(0)}
        creditsTooltip={`You have ${supportCreditsToAllocatedCredits(userSupport)} credits providing ${userSupport} support`}
      />
    ) : isVerifiedLoading || isWalletLoading ? undefined : (
      // Gentle affordance so a signed-out / unverified visitor can see that
      // statements are interactive, and how to unlock supporting them.
      <Tooltip
        title={
          address
            ? "Verify you're human to support this statement"
            : "Join in to support this statement"
        }
        arrow
      >
        <Chip
          icon={<AddRoundedIcon sx={{ fontSize: 16 }} />}
          label={address ? "Verify to support" : "Join in to support"}
          size="small"
          variant="outlined"
          clickable
          onClick={(e) => {
            e.stopPropagation();
            if (address) {
              void rawNavigate("/verify");
            } else {
              connect();
            }
          }}
          sx={{
            color: "text.secondary",
            borderColor: "divider",
            fontWeight: 600,
            "& .MuiChip-icon": { color: "text.secondary" },
            "&:hover": {
              color: "primary.main",
              borderColor: "primary.main",
              bgcolor: "action.hover",
              "& .MuiChip-icon": { color: "primary.main" },
            },
          }}
        />
      </Tooltip>
    );
    const rightTopSlot = onSwitchSupport ? (
      <Tooltip title="Switch support to this statement" arrow>
        <ButtonBase
          aria-label="Switch support to this statement"
          onClick={() => onSwitchSupport(Number(statement.id))}
          sx={{
            width: 32,
            height: 24,
            color: "text.secondary",
            "&:hover": { color: "text.primary" },
          }}
        >
          <MergeIcon sx={{ fontSize: 22, transform: "rotate(90deg)" }} />
        </ButtonBase>
      </Tooltip>
    ) : undefined;

    return (
      <StatementCardShell
        leftSlot={leftSlot}
        text={statement.text}
        statsSlot={statsSlot}
        voteControls={voteControls}
        topRightSlot={bookmarkSlot}
        rightTopSlot={rightTopSlot}
        onClick={handleCardClick}
        cornerTab={
          hasUncommittedSupport ? (
            <Tooltip title="Clear staged support" arrow placement="right">
              <ButtonBase
                className="staged-clear-tab"
                aria-label="Clear staged support"
                onClick={(e) => {
                  e.stopPropagation();
                  handleClearStaged();
                }}
                sx={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  height: 20,
                  width: 0,
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "center",
                  pt: 0.5,
                  color: "#fff",
                  bgcolor: stagedSupportColor,
                  borderBottomRightRadius: 6,
                  opacity: 0,
                  transition: "width 0.15s ease, opacity 0.15s ease",
                  zIndex: 2,
                }}
              >
                <CloseRoundedIcon sx={{ fontSize: 12 }} />
              </ButtonBase>
            </Tooltip>
          ) : undefined
        }
        sx={{
          cursor: "pointer",
          transition: "box-shadow 0.2s ease, border-color 0.2s ease",
          "&:hover": { boxShadow: 3 },
          "&:hover .staged-clear-tab": { width: 16, opacity: 1 },
          borderLeft: hasUncommittedSupport
            ? "3.5px solid"
            : "3.5px solid transparent",
          borderColor: hasUncommittedSupport
            ? stagedSupportColor
            : "transparent",
        }}
      />
    );
  }, [
    rankChange,
    isHotRankChange,
    currentRank,
    rankingProgress,
    globalSupport,
    peakRank,
    onToggleBookmark,
    statement,
    isBookmarked,
    isUserVerified,
    userSupport,
    hasUncommittedSupport,
    handleSupportChange,
    handleClearStaged,
    isVerifiedLoading,
    isWalletLoading,
    address,
    rawNavigate,
    connect,
    onSwitchSupport,
    handleCardClick,
    stagedSupportColor,
  ]);

  return card;
};

// Memoized so that a parent list re-rendering (e.g. on a staged vote toggle)
// does not re-render every card. Cards whose props are unchanged bail out; the
// toggled card still updates via its useStatementSupport subscription.
export const StatementCard = memo(StatementCardComponent);

export default StatementCard;
