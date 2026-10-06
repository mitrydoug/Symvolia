import { FC, useMemo, useState, useCallback } from "react";
import { useReadContract } from "wagmi";
import { useUserVotes } from "../state/UserVotes";
import { useForum, FORUM_ABI } from "../state/Forum";
import { Statement } from "../types";
import StatementList from "./StatementList";
import { StatementListSkeleton } from "./StatementCardSkeleton";
import { Navigate } from "react-router-dom";
import useIsMobile from "@/hooks/useIsMobile";
import useBlockSync from "@/hooks/useBlockSync";
import useLocalStorageSet from "@/hooks/useLocalStorageSet";
import useGracefulLoading from "@/hooks/useGracefulLoading";
import { useCreditConversion } from "@/hooks/useCreditConversion";

const MySupport: FC = () => {
  const {
    isUserVerified,
    isVerifiedLoading,
    state: userVoteState,
  } = useUserVotes();
  const { forumContractAddress } = useForum();
  const isMobile = useIsMobile();
  const { has: isBookmarked, toggle: toggleBookmark } =
    useLocalStorageSet("bookmarks");
  const { toCredits } = useCreditConversion();

  const PAGE_SIZE = isMobile ? 10 : 20;

  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);
  const [pageIndex, setPageIndex] = useState(0);

  // Get statement IDs where the user has non-zero on-chain support (in credits).
  const statementIds = useMemo(() => {
    return Array.from(userVoteState?.onChain?.statementSupport?.entries() || [])
      .filter(([, support]) => toCredits(support) !== 0)
      .sort(([, a], [, b]) => b - a)
      .map(([id]) => BigInt(id));
  }, [userVoteState, toCredits]);

  const result = useReadContract({
    address: forumContractAddress,
    abi: FORUM_ABI,
    functionName: "getStatementsById",
    args: [statementIds],
  });

  // Sync with blockchain on every new block
  useBlockSync(result.refetch);

  const handleLoadMore = useCallback(() => {
    setDisplayCount((prev) => prev + PAGE_SIZE);
    setPageIndex((prev) => prev + 1);
  }, [PAGE_SIZE]);

  const { isLoading: isLoadingState, showSkeleton } = useGracefulLoading(
    isVerifiedLoading || (isUserVerified && !userVoteState?.onChain),
  );

  if (showSkeleton) {
    return <StatementListSkeleton />;
  }

  if (isLoadingState) {
    return null;
  }

  if (!isUserVerified) {
    return <Navigate to="/" replace />;
  }

  const myStatements = result.data as Statement[] | undefined;
  const displayedStatements = myStatements?.slice(0, displayCount) || [];
  const hasMore = myStatements ? displayCount < myStatements.length : false;

  return (
    <StatementList
      statements={displayedStatements}
      hasMore={hasMore}
      isLoading={result.isLoading}
      onLoadMore={handleLoadMore}
      pageIndex={pageIndex}
      isBookmarked={isBookmarked}
      onToggleBookmark={toggleBookmark}
      showStagedStatements
    />
  );
};

export default MySupport;
