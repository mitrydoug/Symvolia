import { useEffect } from "react";
import { optionalEnvValue } from "@/envVars";
import useLocalStorageValue from "./useLocalStorageValue";

export type SearchEngineMode = "backend" | "local";

export const SEARCH_ENGINE_STORAGE_KEY = "symvolia:settings:searchEngine";

/** Base URL for backend HTTP APIs (search, gas-sponsorship eligibility, …). */
export const backendApiUrl = optionalEnvValue(import.meta.env.VITE_BACKEND_URL);

/** Whether the backend text-search UI is offered (independent of the URL). */
export const backendSearchEnabled =
  import.meta.env.VITE_ENABLE_BACKEND_SEARCH === "true";

/** Backend search is usable only when explicitly enabled and a URL is set. */
export const hasBackendSearch =
  backendSearchEnabled && backendApiUrl !== undefined;

/**
 * The user's selected search engine, persisted per browser. When backend
 * search is unavailable, the stored value is normalised back to "local".
 */
export function useSearchEngineMode(): [
  SearchEngineMode,
  (mode: SearchEngineMode) => void,
] {
  const [raw, setRaw] = useLocalStorageValue(
    SEARCH_ENGINE_STORAGE_KEY,
    "local",
  );

  useEffect(() => {
    if (!hasBackendSearch && raw === "backend") {
      setRaw("local");
    }
  }, [raw, setRaw]);

  const mode: SearchEngineMode =
    hasBackendSearch && raw === "backend" ? "backend" : "local";

  return [mode, setRaw];
}

export default useSearchEngineMode;
