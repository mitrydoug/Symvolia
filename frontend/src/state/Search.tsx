import {
  createContext,
  FC,
  ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";

interface SearchContextValue {
  /** The current search query (updates instantly on every keystroke). */
  query: string;
  /** Update the search query. */
  setQuery: (value: string) => void;
  /** Clear the search query and sync the URL immediately. */
  clearQuery: () => void;
}

const SearchContext = createContext<SearchContextValue | null>(null);

/**
 * Read the `?q=` search param from the current URL hash.
 *
 * Works with `createHashRouter` where the URL looks like
 * `…/#/?q=foo` or `…/#/`.
 */
function readQueryFromHash(): string {
  const hash = window.location.hash; // e.g. "#/?q=hello"
  const qIdx = hash.indexOf("?");
  if (qIdx === -1) return "";
  const params = new URLSearchParams(hash.slice(qIdx));
  return params.get("q") ?? "";
}

/**
 * Silently replace the URL hash without triggering React Router re-renders.
 */
export function writeQueryToHash(value: string): void {
  const hash = window.location.hash;
  // Extract the pathname portion (everything before '?').
  const qIdx = hash.indexOf("?");
  const pathname = qIdx === -1 ? hash : hash.slice(0, qIdx);

  const newHash = value
    ? `${pathname}?q=${encodeURIComponent(value)}`
    : pathname;

  window.history.replaceState(null, "", newHash);
}

export const SearchProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [query, setQueryState] = useState(() => readQueryFromHash());

  const setQuery = useCallback((value: string) => {
    setQueryState(value);
  }, []);

  const clearQuery = useCallback(() => {
    setQueryState("");
    writeQueryToHash("");
  }, []);

  return (
    <SearchContext.Provider value={{ query, setQuery, clearQuery }}>
      {children}
    </SearchContext.Provider>
  );
};

export function useSearchQuery(): SearchContextValue {
  const ctx = useContext(SearchContext);
  if (!ctx) {
    throw new Error("useSearchQuery must be used within a <SearchProvider>");
  }
  return ctx;
}
