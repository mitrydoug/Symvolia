import { FC, useEffect, useRef } from "react";
import { Statement } from "../types";
import { Box, CircularProgress, Stack, Typography } from "@mui/material";
import { theme } from "../theme";
import StatementCard from "./StatementCard";
import StagedStatementCard from "./StagedStatementCard";
import { StatementListSkeleton } from "./StatementCardSkeleton";
import { useUserVotes } from "../state/UserVotes";
import useGracefulLoading from "@/hooks/useGracefulLoading";

type StatementListProps = {
  statements: Statement[];
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
  /** How many pages the user has loaded beyond the first (0 = first page only). */
  pageIndex?: number;
  /** Label shown next to the spinner while loading. */
  loadingLabel?: string;
  isBookmarked?: (statementId: number) => boolean;
  onToggleBookmark?: (statementId: number) => void;
  /** When true, staged (uncommitted) statements are shown at the top. */
  showStagedStatements?: boolean;
};

const StatementList: FC<StatementListProps> = ({
  statements,
  hasMore,
  isLoading,
  onLoadMore,
  pageIndex = 0,
  loadingLabel = "Loading more statements\u2026",
  isBookmarked,
  onToggleBookmark,
  showStagedStatements = false,
}) => {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const userVotes = useUserVotes();

  const stagedStatements = userVotes.state?.staged?.stagedStatements ?? [];
  const unstageStatement = userVotes.unstageStatement;
  const updateStagedInitialSupport = userVotes.updateStagedInitialSupport;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    // Find the nearest scrollable ancestor to use as the observer root.
    // The app layout scrolls inside a Container (overflow-y: auto), not
    // the viewport, so a default (viewport) root would miss scroll events.
    let root: Element | null = null;
    let el: Element | null = sentinel.parentElement;
    while (el) {
      const { overflowY } = getComputedStyle(el);
      if (overflowY === "auto" || overflowY === "scroll") {
        root = el;
        break;
      }
      el = el.parentElement;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          onLoadMore();
        }
      },
      { threshold: 0.1, root },
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [hasMore, isLoading, onLoadMore]);

  const hasStagedStatements =
    showStagedStatements && stagedStatements && stagedStatements.length > 0;

  // Initial load: show skeleton cards after a grace period
  const isInitialLoad = isLoading && statements.length === 0 && pageIndex === 0;
  const { showSkeleton: showInitialSkeleton } =
    useGracefulLoading(isInitialLoad);
  if (showInitialSkeleton && !hasStagedStatements) {
    return <StatementListSkeleton />;
  }

  if (!isLoading && statements.length === 0 && !hasStagedStatements) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100%",
        }}
      >
        <Typography variant="body1" color="text.secondary">
          No statements found.
        </Typography>
      </Box>
    );
  }

  return (
    <>
      <Stack spacing={1}>
        {/*
          Staged (pending) statements live only in UserVotes state until commit.
          Their card UI is rendered by StagedStatementCard.
        */}
        {hasStagedStatements &&
          stagedStatements.map((staged) => (
            <StagedStatementCard
              key={`staged-${staged.tempId}`}
              staged={staged}
              onUnstage={unstageStatement}
              onUpdateSupport={updateStagedInitialSupport}
            />
          ))}

        {/* On-chain statements */}
        {statements?.map((stmt) => (
          <StatementCard
            key={`stmt-${Number(stmt.id)}`}
            statement={stmt}
            isBookmarked={isBookmarked?.(Number(stmt.id))}
            onToggleBookmark={onToggleBookmark}
          />
        ))}
      </Stack>

      {/* Sentinel element for intersection observer - also displays status text */}
      <Box
        ref={sentinelRef}
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          py: theme.custom.statementList.endIndicatorPadding,
          minHeight: "20px",
        }}
      >
        {isLoading && !isInitialLoad && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <CircularProgress size={16} />
            <Typography variant="body2" color="text.secondary">
              {loadingLabel}
            </Typography>
          </Box>
        )}
        {!hasMore && !isLoading && statements.length > 0 && pageIndex > 0 && (
          <Typography variant="body2" color="text.secondary">
            No more statements
          </Typography>
        )}
      </Box>
    </>
  );
};

export default StatementList;
