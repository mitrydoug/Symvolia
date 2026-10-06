import useLocalStorageValue from "./useLocalStorageValue";

/**
 * Which browser-local search engine to use:
 * - "lexical": MiniSearch (BM25 keyword/prefix/fuzzy). Tiny, instant, default.
 * - "hybrid": Orama BM25 + on-device MiniLM sentence embeddings (semantic).
 *   Downloads a ~30 MB model on first use and embeds statements in a Web Worker.
 *
 * This is orthogonal to {@link useSearchEngineMode} (backend vs browser-local):
 * it only chooses *which* local engine runs when browser-local search is active.
 */
export type LocalSearchEngineKind = "lexical" | "hybrid";

export const LOCAL_SEARCH_ENGINE_STORAGE_KEY =
  "symvolia:settings:localSearchEngine";

export function useLocalSearchEngine(): [
  LocalSearchEngineKind,
  (kind: LocalSearchEngineKind) => void,
] {
  const [raw, setRaw] = useLocalStorageValue(
    LOCAL_SEARCH_ENGINE_STORAGE_KEY,
    "lexical",
  );
  const kind: LocalSearchEngineKind = raw === "hybrid" ? "hybrid" : "lexical";
  return [kind, setRaw];
}

export default useLocalSearchEngine;
