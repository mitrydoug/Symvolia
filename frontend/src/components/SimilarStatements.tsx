import { FC, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, CircularProgress, Stack, Typography } from "@mui/material";
import { useReadContract } from "wagmi";

import { useForum, FORUM_ABI } from "../state/Forum";
import { useSearch } from "@/hooks/useSearch";
import useBlockSync from "@/hooks/useBlockSync";
import useIsMobile from "@/hooks/useIsMobile";
import useLocalStorageSet from "@/hooks/useLocalStorageSet";
import StatementCard from "./StatementCard";
import { Statement } from "../types";
import { fuseSimilarStatements } from "../localSearch/rankFusion";
import {
  useStatementSupport,
  useSupportStore,
  useUserVerification,
} from "../state/UserVotes";

interface SimilarStatementsProps {
  /** Text to search for similar statements. */
  query: string;
  /** Optional statement ID to exclude from results (e.g. the statement itself). */
  excludeId?: bigint;
  /** Statement whose effective support can be switched to a similar result. */
  switchSupportFromId?: bigint;
  /** Keep the section heading and tabs pinned while scrolling results. */
  stickyHeader?: boolean;
}

/**
 * Reusable panel that searches for and displays statements similar to the
 * given query text. Used by both CreateStatementForm and StatementPage.
 */
const SimilarStatements: FC<SimilarStatementsProps> = ({
  query,
  excludeId,
  switchSupportFromId,
  stickyHeader = false,
}) => {
  const { forumContractAddress } = useForum();
  const { isUserVerified } = useUserVerification();
  const { switchSupport, getEffectiveSupportParts } = useSupportStore();
  // Subscribe only to the SOURCE statement's support so toggling a target card
  // in the list below does not re-render this component (and thus does not
  // recreate every card element).
  const sourceStatementId =
    switchSupportFromId !== undefined ? Number(switchSupportFromId) : -1;
  const { supportParts: sourceSupportParts } =
    useStatementSupport(sourceStatementId);
  const { has: isBookmarked, toggle: toggleBookmark } =
    useLocalStorageSet("bookmarks");

  const switchSourceSupport =
    isUserVerified && switchSupportFromId !== undefined
      ? sourceSupportParts
      : 0;
  const handleSwitchSupport = useCallback(
    (targetStatementId: number) => {
      if (!isUserVerified || switchSupportFromId === undefined) {
        return;
      }
      switchSupport(Number(switchSupportFromId), targetStatementId);
    },
    [isUserVerified, switchSupportFromId, switchSupport],
  );
  const onSwitchSupport =
    switchSourceSupport !== 0 ? handleSwitchSupport : undefined;

  const canSwitchSupportTo = useCallback(
    (targetStatementId: number) => {
      if (!isUserVerified || switchSourceSupport === 0) return false;
      const targetSupport = getEffectiveSupportParts(targetStatementId);
      return (
        targetSupport === 0 ||
        Math.sign(targetSupport) === Math.sign(switchSourceSupport)
      );
    },
    [isUserVerified, switchSourceSupport, getEffectiveSupportParts],
  );

  const hasSearch = query.trim().length > 0;
  const { hits, isLoading: isSearchLoading } = useSearch(
    query,
    forumContractAddress,
    {
      similarStatementId: excludeId,
      mode: "similarity",
    },
  );

  // Fetch the current statement count so we can discard stale/invalid IDs
  // that would cause getStatementsById to revert.
  const { data: statementCountRaw } = useReadContract({
    address: forumContractAddress,
    abi: FORUM_ABI,
    functionName: "statementCount",
  });
  const statementCount =
    statementCountRaw !== undefined ? Number(statementCountRaw) : undefined;

  // Filter out any search hit whose ID is >= statementCount (stale index)
  // and optionally exclude a specific statement.
  const statementIds = useMemo(() => {
    if (statementCount === undefined) return [];
    return hits
      .filter(
        (h) =>
          h.statementId < statementCount &&
          (excludeId === undefined || BigInt(h.statementId) !== excludeId),
      )
      .map((h) => BigInt(h.statementId));
  }, [hits, statementCount, excludeId]);

  const result = useReadContract({
    address: forumContractAddress,
    abi: FORUM_ABI,
    functionName: "getStatementsById",
    args: [statementIds],
    query: { enabled: statementIds.length > 0 },
  });

  useBlockSync(result.refetch);

  const rawStatements = result.data as Statement[] | undefined;

  const relevanceOrder = useMemo(() => {
    const map = new Map<number, number>();
    hits.forEach((h, i) => map.set(h.statementId, i));
    return map;
  }, [hits]);

  // Single ordered list: a Reciprocal Rank Fusion of the similarity order and
  // the same results re-ranked by total vote count. See rankFusion.ts for the
  // SIMILARITY_WEIGHT / SUPPORT_WEIGHT / RRF_K tuning knobs.
  const similarStatements: Statement[] = useMemo(() => {
    if (!rawStatements) return [];
    return fuseSimilarStatements(rawStatements, relevanceOrder);
  }, [rawStatements, relevanceOrder]);

  const isSimilarLoading = isSearchLoading || result.isLoading;
  const noSimilarResults = result.isError && !result.isLoading;

  // Paginate the rendered list the same way the home feed does: keep only
  // PAGE_SIZE cards mounted and reveal more as the sentinel scrolls into view.
  // Similarity searches can return up to VITE_SEARCH_RESULTS_LIMIT (100) hits,
  // and mounting them all at once is the main render-time jank.
  const isMobile = useIsMobile();
  const PAGE_SIZE = isMobile ? 10 : 20;
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);

  // Reset paging whenever the result set changes (new query).
  useEffect(() => {
    setDisplayCount(PAGE_SIZE);
  }, [query, PAGE_SIZE]);

  const displayedStatements = similarStatements.slice(0, displayCount);
  const hasMore = displayCount < similarStatements.length;

  const handleLoadMore = useCallback(() => {
    setDisplayCount((prev) => prev + PAGE_SIZE);
  }, [PAGE_SIZE]);

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    // The app scrolls inside a Container (overflow-y: auto), not the viewport,
    // so observe against the nearest scrollable ancestor.
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
        if (entries[0].isIntersecting && hasMore) {
          handleLoadMore();
        }
      },
      { threshold: 0.1, root },
    );
    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [hasMore, handleLoadMore]);

  const header = (
    <Typography variant="subtitle2" sx={{ mb: 1 }}>
      Similar Statements
    </Typography>
  );

  return (
    <Box>
      {stickyHeader ? (
        <Box
          sx={{
            position: "sticky",
            top: (theme) => theme.spacing(-2),
            zIndex: 3,
            bgcolor: "background.default",
            mx: -3,
            mt: -2,
            px: 3,
            pt: 2.5,
            pb: 1,
          }}
        >
          {header}
        </Box>
      ) : (
        header
      )}

      <Box sx={{ py: 0.5 }}>
        {isSimilarLoading && !noSimilarResults && hasSearch ? (
          <Stack alignItems="center" justifyContent="center" sx={{ py: 4 }}>
            <CircularProgress size={24} />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Searching…
            </Typography>
          </Stack>
        ) : similarStatements.length > 0 ? (
          <Stack spacing={1}>
            {displayedStatements.map((stmt) => (
              <StatementCard
                key={`similar-${Number(stmt.id)}`}
                statement={stmt}
                isBookmarked={isBookmarked(Number(stmt.id))}
                onToggleBookmark={toggleBookmark}
                onSwitchSupport={
                  canSwitchSupportTo(Number(stmt.id))
                    ? onSwitchSupport
                    : undefined
                }
              />
            ))}
            {hasMore && (
              <Box
                ref={sentinelRef}
                sx={{ display: "flex", justifyContent: "center", py: 2 }}
              >
                <CircularProgress size={20} />
              </Box>
            )}
          </Stack>
        ) : (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ py: 3, textAlign: "center" }}
          >
            {hasSearch
              ? "No similar statements found."
              : "Start typing to see similar statements."}
          </Typography>
        )}
      </Box>
    </Box>
  );
};

export default SimilarStatements;
