import { useEffect, useRef, useState } from "react";
import { writeQueryToHash } from "@/state/Search";
import { backendApiUrl, useSearchEngineMode } from "./useSearchEngineMode";
import { useLocalSearch } from "@/state/LocalSearch";
import type { SearchMode } from "@/localSearch/types";

/** Maximum number of search results to fetch. */
const configuredSearchResultsLimit = Number.parseInt(
  import.meta.env.VITE_SEARCH_RESULTS_LIMIT ?? "20",
  10,
);

if (
  !Number.isFinite(configuredSearchResultsLimit) ||
  configuredSearchResultsLimit <= 0
) {
  throw new Error("VITE_SEARCH_RESULTS_LIMIT must be a positive number");
}

export const SEARCH_RESULTS_LIMIT = configuredSearchResultsLimit;

/** Debounce delay in milliseconds before running a search. */
const DEBOUNCE_MS = 300;

export interface SearchHit {
  statementId: number;
}

interface UseSearchResult {
  /** Ordered list of statement IDs matching the query (by relevance). */
  hits: SearchHit[];
  /** Whether a search request is in-flight. */
  isLoading: boolean;
}

interface UseSearchOptions {
  updateUrl?: boolean;
  /** Exclude this statement id from results (e.g. the statement being viewed). */
  similarStatementId?: bigint;
  /** Search behavior. Defaults to keyword. Only affects the local engine. */
  mode?: SearchMode;
}

/**
 * Debounced statement search. Routes to either the hosted backend search
 * service or the browser-local search engine based on the user's Settings
 * selection ({@link useSearchEngineMode}).
 *
 * Waits {@link DEBOUNCE_MS} after the last `query` change before searching. On a
 * successful search the URL hash is updated (when `updateUrl`) so the query is
 * reflected in a copyable/bookmarkable URL.
 *
 * Returns an ordered list of statement IDs sorted by relevance. When `query` is
 * empty the result set is cleared immediately (no request) and the URL is not
 * touched (the caller handles clearing via `clearQuery`).
 */
export function useSearch(
  query: string,
  forumAddress: string,
  {
    updateUrl = false,
    similarStatementId,
    mode = "keyword",
  }: UseSearchOptions = {},
): UseSearchResult {
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [engineMode] = useSearchEngineMode();
  const { search: localSearchFn } = useLocalSearch();

  // Track the latest request so we can discard stale responses.
  const inflightRef = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setHits([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const timer = setTimeout(() => {
      const requestId = ++inflightRef.current;

      const runLocal = async (): Promise<number[]> => {
        const ids = await localSearchFn(trimmed, mode, SEARCH_RESULTS_LIMIT);
        return similarStatementId !== undefined
          ? ids.filter((id) => id !== Number(similarStatementId))
          : ids;
      };

      const runBackend = async (): Promise<number[]> => {
        if (!backendApiUrl) {
          throw new Error("Backend search is not configured");
        }

        const lexicalParams = new URLSearchParams({
          statement_text: trimmed,
          forum_address: forumAddress,
        });

        const similarParams =
          similarStatementId === undefined
            ? undefined
            : new URLSearchParams({
                statement_id: similarStatementId.toString(),
                forum_address: forumAddress,
                limit: SEARCH_RESULTS_LIMIT.toString(),
              });

        const fetchResults = async (): Promise<unknown> => {
          if (similarParams !== undefined) {
            const similarResponse = await fetch(
              `${backendApiUrl}/similar?${similarParams.toString()}`,
            );
            if (similarResponse.ok) {
              return similarResponse.json();
            }
          }

          const lexicalResponse = await fetch(
            `${backendApiUrl}/search?${lexicalParams.toString()}`,
          );
          if (!lexicalResponse.ok) {
            throw new Error("Search request failed");
          }
          return lexicalResponse.json();
        };

        const data = await fetchResults();
        const results = Array.isArray(data) ? data : [];
        return results
          .slice(0, SEARCH_RESULTS_LIMIT)
          .map((r: { statement_id: number }) => r.statement_id);
      };

      const run = engineMode === "local" ? runLocal : runBackend;

      run()
        .then((ids) => {
          if (requestId !== inflightRef.current) return;

          setHits(ids.map((statementId) => ({ statementId })));
          setIsLoading(false);

          // Sync the successfully-searched query to the URL.
          if (updateUrl) {
            writeQueryToHash(trimmed);
          }
        })
        .catch(() => {
          if (requestId !== inflightRef.current) return;
          setHits([]);
          setIsLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [
    query,
    forumAddress,
    updateUrl,
    similarStatementId,
    mode,
    engineMode,
    localSearchFn,
  ]);

  return { hits, isLoading };
}
