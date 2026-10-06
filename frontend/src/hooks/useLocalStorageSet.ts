import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useForum } from "../state/Forum";
import { useWalletAuth } from "@/wallet";

/**
 * Custom event name used to synchronise localStorage-set writes
 * across hook instances within the **same** tab. The native `storage`
 * event only fires in *other* tabs, so we dispatch this on `window`
 * whenever a value is written.
 */
const LS_SET_SYNC_EVENT = "symvolia:ls-set-sync";

/** Notify every subscriber in this tab that a key changed. */
const emitSync = (key: string) => {
  window.dispatchEvent(new CustomEvent(LS_SET_SYNC_EVENT, { detail: key }));
};

/** Read a Set<number> from localStorage (returns empty set on any error). */
const readSet = (storageKey: string): Set<number> => {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) return new Set(JSON.parse(raw) as number[]);
  } catch {
    // localStorage unavailable or data corrupted
  }
  return new Set();
};

/** Write a Set<number> to localStorage and notify same-tab listeners. */
const writeSet = (storageKey: string, set: Set<number>): void => {
  try {
    localStorage.setItem(storageKey, JSON.stringify([...set]));
  } catch {
    // quota exceeded or localStorage unavailable
  }
  emitSync(storageKey);
};

/**
 * A hook that manages a Set<number> backed by localStorage.
 *
 * Uses `useSyncExternalStore` so that **all** component instances sharing
 * the same key stay in sync — both across tabs (via the native `storage`
 * event) and within the same tab (via a lightweight custom event).
 *
 * The storage key is scoped by:
 *   - forum name  — each forum has its own set
 *   - chain fingerprint  — derived from the genesis block hash so data is
 *     automatically invalidated whenever the chain is reset
 *   - wallet address  — per-user data stays private to each account
 *
 * Returns empty data (no reads/writes) until the chain fingerprint has been
 * resolved, preventing any stale-deployment data from leaking through.
 */
const useLocalStorageSet = (
  key: string,
): {
  values: number[];
  has: (id: number) => boolean;
  add: (id: number) => void;
  remove: (id: number) => void;
  toggle: (id: number) => void;
} => {
  const { name: forumName, chainFingerprint } = useForum();
  const { address } = useWalletAuth();

  // Shorten address to first 4 bytes (10 chars inc. "0x") for a compact key.
  const addrKey = address ? address.slice(0, 10) : "anon";

  // storageKey is undefined while the chain fingerprint is loading — hooks
  // that depend on it will return empty data during that window.
  const storageKey =
    chainFingerprint !== undefined
      ? `symvolia:${key}:${chainFingerprint}:${forumName}:${addrKey}`
      : undefined;

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      // Same-tab writes from other hook instances
      const handleSync = (e: Event) => {
        if ((e as CustomEvent).detail === storageKey) onStoreChange();
      };
      // Cross-tab writes
      const handleStorage = (e: StorageEvent) => {
        if (e.key === storageKey) onStoreChange();
      };
      window.addEventListener(LS_SET_SYNC_EVENT, handleSync);
      window.addEventListener("storage", handleStorage);
      return () => {
        window.removeEventListener(LS_SET_SYNC_EVENT, handleSync);
        window.removeEventListener("storage", handleStorage);
      };
    },
    [storageKey],
  );

  const getSnapshot = useCallback((): string => {
    if (!storageKey) return "[]";
    try {
      return localStorage.getItem(storageKey) ?? "[]";
    } catch {
      return "[]";
    }
  }, [storageKey]);

  const raw = useSyncExternalStore(subscribe, getSnapshot, () => "[]");

  // Deserialise and build values array only when the snapshot changes.
  const values: number[] = useMemo(() => {
    try {
      return JSON.parse(raw) as number[];
    } catch {
      return [];
    }
  }, [raw]);

  const valuesSet = useMemo(() => new Set(values), [values]);

  const has = useCallback((id: number) => valuesSet.has(id), [valuesSet]);

  const add = useCallback(
    (id: number) => {
      if (!storageKey) return;
      const current = readSet(storageKey);
      if (current.has(id)) return;
      current.add(id);
      writeSet(storageKey, current);
    },
    [storageKey],
  );

  const remove = useCallback(
    (id: number) => {
      if (!storageKey) return;
      const current = readSet(storageKey);
      if (!current.has(id)) return;
      current.delete(id);
      writeSet(storageKey, current);
    },
    [storageKey],
  );

  const toggle = useCallback(
    (id: number) => {
      if (!storageKey) return;
      const current = readSet(storageKey);
      if (current.has(id)) {
        current.delete(id);
      } else {
        current.add(id);
      }
      writeSet(storageKey, current);
    },
    [storageKey],
  );

  return { values, has, add, remove, toggle };
};

export default useLocalStorageSet;
