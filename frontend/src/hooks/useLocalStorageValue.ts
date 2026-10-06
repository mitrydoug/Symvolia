import { useCallback, useSyncExternalStore } from "react";

/**
 * Custom event name used to synchronise localStorage writes
 * across hooks within the **same** tab. The native `storage` event
 * only fires in *other* tabs, so we dispatch this event on `window`
 * whenever a value is written.
 */
const LOCAL_STORAGE_SYNC_EVENT = "symvolia:local-storage-sync";

/** Notify every subscriber in this tab that a key changed. */
const emitSync = (key: string) => {
  window.dispatchEvent(
    new CustomEvent(LOCAL_STORAGE_SYNC_EVENT, { detail: key }),
  );
};

/**
 * A hook that manages a single string value backed by localStorage.
 *
 * Uses `useSyncExternalStore` so that **all** components sharing the
 * same key stay in sync — both across tabs (via the native `storage`
 * event) and within the same tab (via a lightweight custom event).
 */
const useLocalStorageValue = (
  key: string,
  defaultValue: string = "",
): [string, (value: string) => void] => {
  // subscribe — re-render whenever the key changes in any tab / component
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      // Same-tab writes
      const handleSync = (e: Event) => {
        if ((e as CustomEvent).detail === key) onStoreChange();
      };
      // Cross-tab writes
      const handleStorage = (e: StorageEvent) => {
        if (e.key === key) onStoreChange();
      };

      window.addEventListener(LOCAL_STORAGE_SYNC_EVENT, handleSync);
      window.addEventListener("storage", handleStorage);
      return () => {
        window.removeEventListener(LOCAL_STORAGE_SYNC_EVENT, handleSync);
        window.removeEventListener("storage", handleStorage);
      };
    },
    [key],
  );

  // snapshot — read current value from localStorage
  const getSnapshot = useCallback(() => {
    try {
      return localStorage.getItem(key) ?? defaultValue;
    } catch {
      return defaultValue;
    }
  }, [key, defaultValue]);

  const value = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => defaultValue,
  );

  const set = useCallback(
    (newValue: string) => {
      try {
        localStorage.setItem(key, newValue);
      } catch {
        // Silently fail if localStorage is unavailable or quota exceeded
      }
      emitSync(key);
    },
    [key],
  );

  return [value, set];
};

export default useLocalStorageValue;
