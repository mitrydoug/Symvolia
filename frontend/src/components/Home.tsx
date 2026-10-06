import {
  FC,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  useLayoutEffect,
} from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { Box, LinearProgress, Stack, Typography } from "@mui/material";
import { useForum, FORUM_ABI } from "../state/Forum";
import { Statement } from "../types";
import StatementList from "./StatementList";
import SortTabs, { SortMode } from "./SortTabs";
import { useSearch } from "@/hooks/useSearch";
import useIsMobile from "@/hooks/useIsMobile";
import useBlockSync from "@/hooks/useBlockSync";
import useLocalStorageSet from "@/hooks/useLocalStorageSet";
import { useSearchQuery } from "@/state/Search";
import { useLocalSearch } from "@/state/LocalSearch";

/** Minimum time (ms) the loading spinner is shown when paginating. */
const PAGINATION_MIN_LOADING_MS = 2000;

// ---------------------------------------------------------------------------
// Home view — dual-mode: ranked browsing (empty search) + search results
// ---------------------------------------------------------------------------

const Home: FC = () => {
  const { forumContractAddress } = useForum();
  const isMobile = useIsMobile();
  const { has: isBookmarked, toggle: toggleBookmark } =
    useLocalStorageSet("bookmarks");

  // ── Search state from context ───────────────────────────────────────────
  const { query: searchQuery } = useSearchQuery();
  const hasSearch = searchQuery.trim().length > 0;

  // ── Sort tab ───────────────────────────────────────────────────────────
  const [sortTab, setSortTab] = useState<SortMode>("top");

  // Reset to "top" when the search query is cleared
  useLayoutEffect(() => {
    if (!hasSearch && sortTab !== "top") {
      setSortTab("top");
    }
  }, [hasSearch, sortTab]);

  return (
    <>
      <SortTabs value={sortTab} onChange={setSortTab} hasSearch={hasSearch} />
      {hasSearch ? (
        <SearchResults
          searchQuery={searchQuery}
          sortTab={sortTab}
          forumContractAddress={forumContractAddress}
          isBookmarked={isBookmarked}
          onToggleBookmark={toggleBookmark}
        />
      ) : (
        <RankedBrowse
          forumContractAddress={forumContractAddress}
          isMobile={isMobile}
          isBookmarked={isBookmarked}
          onToggleBookmark={toggleBookmark}
        />
      )}
    </>
  );
};

// ---------------------------------------------------------------------------
// Sub-view: search results (active query)
// ---------------------------------------------------------------------------

// Shown while the semantic index builds on first use. A single neutral label
// covers the whole process; the bar is indeterminate during the (fast) model
// download and the brief chain-read step, then switches to determinate while
// statements are embedded so users see real forward motion.
const SemanticIndexingPanel: FC = () => {
  const { indexProgress } = useLocalSearch();
  const indexing = indexProgress?.phase === "index";
  const value = indexing ? Math.round(indexProgress.fraction * 100) : undefined;

  return (
    <Box sx={{ py: 4, px: 2, maxWidth: 420, mx: "auto", textAlign: "center" }}>
      <Stack spacing={1.5}>
        <Typography variant="body2" color="text.secondary">
          Preparing your search…
        </Typography>
        <LinearProgress
          variant={indexing ? "determinate" : "indeterminate"}
          value={value}
          sx={{ borderRadius: 1, height: 6 }}
        />
      </Stack>
    </Box>
  );
};

interface SearchResultsProps {
  searchQuery: string;
  sortTab: SortMode;
  forumContractAddress: `0x${string}`;
  isBookmarked: (id: number) => boolean;
  onToggleBookmark: (id: number) => void;
}

const SearchResults: FC<SearchResultsProps> = ({
  searchQuery,
  sortTab,
  forumContractAddress,
  isBookmarked,
  onToggleBookmark,
}) => {
  const { hits, isLoading: isSearchLoading } = useSearch(
    searchQuery,
    forumContractAddress,
    { updateUrl: true },
  );

  // While the semantic index is still building on first use, show progress
  // instead of an empty "Searching…" state — the query will run once it's ready.
  const { engineKind, isIndexing, isReady } = useLocalSearch();
  const semanticBuilding = engineKind === "hybrid" && isIndexing && !isReady;

  // Fetch the current statement count so we can discard stale/invalid IDs
  // that would cause getStatementsById to revert.
  const { data: statementCountRaw } = useReadContract({
    address: forumContractAddress,
    abi: FORUM_ABI,
    functionName: "statementCount",
  });
  const statementCount =
    statementCountRaw !== undefined ? Number(statementCountRaw) : undefined;

  // Filter out any search hit whose ID is >= statementCount (stale index).
  const statementIds = useMemo(() => {
    if (statementCount === undefined) return [];
    return hits
      .filter((h) => h.statementId < statementCount)
      .map((h) => BigInt(h.statementId));
  }, [hits, statementCount]);

  const result = useReadContract({
    address: forumContractAddress,
    abi: FORUM_ABI,
    functionName: "getStatementsById",
    args: [statementIds],
    query: { enabled: statementIds.length > 0 },
  });

  useBlockSync(result.refetch);

  const rawStatements = result.data as Statement[] | undefined;

  // Build a relevance-order index from the search hits so we can restore it
  // after potential re-sorting.
  const relevanceOrder = useMemo(() => {
    const map = new Map<number, number>();
    hits.forEach((h, i) => map.set(h.statementId, i));
    return map;
  }, [hits]);

  const statements: Statement[] = useMemo(() => {
    if (!rawStatements) return [];

    if (sortTab === "latest") {
      // Sort by statement ID descending (newest first).
      return [...rawStatements].sort((a, b) => Number(b.id) - Number(a.id));
    }

    if (sortTab === "relevant") {
      // Pure Meilisearch relevance order.
      return [...rawStatements].sort((a, b) => {
        const ai = relevanceOrder.get(Number(a.id)) ?? Number.MAX_SAFE_INTEGER;
        const bi = relevanceOrder.get(Number(b.id)) ?? Number.MAX_SAFE_INTEGER;
        return ai - bi;
      });
    }

    // "top" → ranked statements first (ascending rank),
    // then unranked in relevance order.
    const ranked: Statement[] = [];
    const unranked: Statement[] = [];

    for (const s of rawStatements) {
      if (Number(s.rank) >= 0) {
        ranked.push(s);
      } else {
        unranked.push(s);
      }
    }

    ranked.sort((a, b) => Number(a.rank) - Number(b.rank));
    unranked.sort((a, b) => {
      const ai = relevanceOrder.get(Number(a.id)) ?? Number.MAX_SAFE_INTEGER;
      const bi = relevanceOrder.get(Number(b.id)) ?? Number.MAX_SAFE_INTEGER;
      return ai - bi;
    });

    return [...ranked, ...unranked];
  }, [rawStatements, sortTab, relevanceOrder]);

  const isLoading = isSearchLoading || result.isLoading;
  // Treat contract errors (e.g. all IDs invalid) as "no results".
  const noResults = result.isError && !result.isLoading;

  if (semanticBuilding) {
    return <SemanticIndexingPanel />;
  }

  return (
    <StatementList
      statements={noResults ? [] : statements}
      hasMore={false}
      isLoading={noResults ? false : isLoading}
      onLoadMore={() => {}}
      loadingLabel="Searching…"
      isBookmarked={isBookmarked}
      onToggleBookmark={onToggleBookmark}
    />
  );
};

// ---------------------------------------------------------------------------
// Sub-view: ranked browsing (empty search — existing behaviour)
// ---------------------------------------------------------------------------

interface RankedBrowseProps {
  forumContractAddress: `0x${string}`;
  isMobile: boolean;
  isBookmarked: (id: number) => boolean;
  onToggleBookmark: (id: number) => void;
}

const RankedBrowse: FC<RankedBrowseProps> = ({
  forumContractAddress,
  isMobile,
  isBookmarked,
  onToggleBookmark,
}) => {
  const PAGE_SIZE = isMobile ? 10 : 20;

  const [statements, setStatements] = useState<Statement[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [isPaginationLoading, setIsPaginationLoading] = useState(false);
  const paginationTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Clean up pagination timer on unmount.
  useEffect(() => {
    return () => {
      if (paginationTimerRef.current) clearTimeout(paginationTimerRef.current);
    };
  }, []);

  // Reset state when forum changes.
  useEffect(() => {
    setStatements([]);
    setOffset(0);
    setHasMore(false);
    setPageIndex(0);
    setIsPaginationLoading(false);
    if (paginationTimerRef.current) clearTimeout(paginationTimerRef.current);
  }, [forumContractAddress]);

  const {
    data: [rankedCountResult, statementsPageResult] = [],
    refetch: refetchRankedBrowse,
    isLoading: isBrowseLoading,
  } = useReadContracts({
    contracts: [
      {
        address: forumContractAddress,
        abi: FORUM_ABI,
        functionName: "rankedCount",
        args: [],
      },
      {
        address: forumContractAddress,
        abi: FORUM_ABI,
        functionName: "getRankedStatementsPage",
        args: [BigInt(offset), BigInt(PAGE_SIZE)],
      },
    ],
  });

  const refetchRankedBrowseCallback = useCallback(() => {
    void refetchRankedBrowse();
  }, [refetchRankedBrowse]);

  useBlockSync(refetchRankedBrowseCallback);

  const rankedCount = rankedCountResult?.result;
  const statementsPage = statementsPageResult?.result as
    | Statement[]
    | undefined;

  const isLoading = isBrowseLoading || isPaginationLoading;

  useEffect(() => {
    if (statementsPage && statementsPage.length > 0 && !isBrowseLoading) {
      setStatements((prev) => {
        const newStatements = [...prev];
        for (let i = 0; i < statementsPage.length; i++) {
          newStatements[offset + i] = statementsPage[i];
        }
        return newStatements;
      });

      if (rankedCount !== undefined) {
        setHasMore(offset + statementsPage.length < Number(rankedCount));
      }
    }
  }, [statementsPage, offset, rankedCount, isBrowseLoading]);

  const handleLoadMore = useCallback(() => {
    if (!isLoading && hasMore) {
      setOffset((prev) => prev + PAGE_SIZE);
      setPageIndex((prev) => prev + 1);
      setIsPaginationLoading(true);

      if (paginationTimerRef.current) clearTimeout(paginationTimerRef.current);
      paginationTimerRef.current = setTimeout(() => {
        setIsPaginationLoading(false);
      }, PAGINATION_MIN_LOADING_MS);
    }
  }, [isLoading, hasMore, PAGE_SIZE]);

  return (
    <StatementList
      statements={statements}
      hasMore={hasMore}
      isLoading={isLoading}
      onLoadMore={handleLoadMore}
      pageIndex={pageIndex}
      isBookmarked={isBookmarked}
      onToggleBookmark={onToggleBookmark}
    />
  );
};

export default Home;
