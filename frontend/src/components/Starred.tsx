import { FC, useState, useCallback, useMemo } from "react";
import { useReadContract } from "wagmi";
import { useForum, FORUM_ABI } from "../state/Forum";
import { Statement } from "../types";
import StatementList from "./StatementList";
import useIsMobile from "@/hooks/useIsMobile";
import useLocalStorageSet from "@/hooks/useLocalStorageSet";
import useBlockSync from "@/hooks/useBlockSync";

const Starred: FC = () => {
  const { forumContractAddress } = useForum();
  const isMobile = useIsMobile();
  const {
    values: bookmarkedIds,
    has: isBookmarked,
    toggle: toggleBookmark,
  } = useLocalStorageSet("bookmarks");

  const PAGE_SIZE = isMobile ? 10 : 20;
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);
  const [pageIndex, setPageIndex] = useState(0);

  const statementIdArgs = useMemo(
    () => bookmarkedIds.map((id) => BigInt(id)),
    [bookmarkedIds],
  );

  const result = useReadContract({
    address: forumContractAddress,
    abi: FORUM_ABI,
    functionName: "getStatementsById",
    args: [statementIdArgs],
    query: { enabled: statementIdArgs.length > 0 },
  });

  useBlockSync(result.refetch);

  const handleLoadMore = useCallback(() => {
    setDisplayCount((prev) => prev + PAGE_SIZE);
    setPageIndex((prev) => prev + 1);
  }, [PAGE_SIZE]);

  const allStatements = result.data as Statement[] | undefined;

  // Sort by global support descending
  const sorted = useMemo(() => {
    if (!allStatements) return [];
    return [...allStatements].sort(
      (a, b) => Number(b.support) - Number(a.support),
    );
  }, [allStatements]);

  const displayedStatements = sorted.slice(0, displayCount);
  const hasMore = sorted.length > displayCount;

  return (
    <StatementList
      statements={displayedStatements}
      hasMore={hasMore}
      isLoading={result.isLoading}
      onLoadMore={handleLoadMore}
      pageIndex={pageIndex}
      isBookmarked={isBookmarked}
      onToggleBookmark={toggleBookmark}
    />
  );
};

export default Starred;
