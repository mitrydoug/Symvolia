import React, {
  FC,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePublicClient, useReadContract } from "wagmi";
import { FORUMS, FORUM_ABI } from "../contracts";
import { FORUMS as FORUM_DATA } from "../components/ChooseForumModal";
export { FORUM_ABI } from "../contracts";

/**
 * Convert a contract-level forum name (e.g. "global", "USA") to a URL slug
 * (e.g. "earth", "usa").
 */
export const forumToSlug = (forumName: string): string => {
  return FORUM_DATA[forumName]?.slug ?? forumName.toLowerCase();
};

/**
 * Convert a URL slug (e.g. "earth", "usa") back to the contract-level forum
 * key (e.g. "global", "USA"). Returns `undefined` for unrecognised slugs.
 */
export const slugToForum = (slug: string): string | undefined => {
  const entry = Object.entries(FORUM_DATA).find(([, f]) => f.slug === slug);
  return entry?.[0];
};

const FORUM_STORAGE_KEY = "symvolia:selectedForum";

/**
 * Keys that must survive a chain-fingerprint sweep because they are either
 * chain-agnostic (selected forum, user settings) or already scoped by address
 * (nickname).
 */
const SWEEP_EXEMPT_PREFIXES = [
  "symvolia:selectedForum",
  "symvolia:nickname:",
  "symvolia:settings:",
];

/**
 * Remove all `symvolia:*` localStorage keys that do not belong to the
 * current chain deployment (identified by `fingerprint`).
 */
const sweepStaleKeys = (fingerprint: string) => {
  try {
    const keys = Object.keys(localStorage).filter(
      (k) =>
        k.startsWith("symvolia:") &&
        !SWEEP_EXEMPT_PREFIXES.some((p) => k.startsWith(p)) &&
        !k.includes(fingerprint),
    );
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    // Silently fail if localStorage is unavailable
  }
};

type ForumName = keyof typeof FORUMS;

const isValidForumName = (value: string): value is ForumName => {
  return value in FORUMS;
};

const getStoredForum = (): ForumName | null => {
  try {
    const stored = localStorage.getItem(FORUM_STORAGE_KEY);
    if (stored && isValidForumName(stored)) {
      return stored;
    }
  } catch {
    // localStorage might be unavailable (privacy mode, SSR, etc.)
    // Silently fail and return null
  }
  return null;
};

/**
 * Read the last-visited forum from localStorage and return its URL slug.
 * Falls back to the default forum slug ("earth") if nothing is stored.
 * Safe to call outside of React (used by the root redirect).
 */
export const getStoredForumSlug = (): string => {
  const stored = getStoredForum();
  return forumToSlug(stored ?? "global");
};

type ForumContextValue = {
  forumContractAddress: `0x${string}`;
  name: string;
  setForum: (name: ForumName) => void;
  /**
   * Sync the forum context from a URL slug. Called by the root layout
   * when the `:forumSlug` param changes. Unlike `setForum` this accepts
   * a slug string and silently ignores unrecognised values.
   */
  syncFromSlug: (slug: string) => void;
  /**
   * A short hex string derived from the genesis block hash that uniquely
   * identifies this chain deployment. `undefined` until the genesis block
   * has been fetched. localStorage reads/writes should be gated on this.
   */
  chainFingerprint: string | undefined;
  /**
   * The credit multiplier for this forum (1 display-credit = creditMultiplier
   * credit parts on-chain). Read from the contract; defaults to 1 until loaded.
   */
  creditMultiplier: number;
};

export const ForumContext = createContext<ForumContextValue | undefined>(
  undefined,
);

export const ForumProvider: FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [forumName, setForumName] = React.useState<ForumName>(() => {
    return getStoredForum() ?? "global";
  });
  const address = useMemo(() => FORUMS[forumName], [forumName]);
  const publicClient = usePublicClient();

  const { data: rawCreditMultiplier } = useReadContract({
    address,
    abi: FORUM_ABI,
    functionName: "creditMultiplier",
    query: { staleTime: Infinity },
  });
  const creditMultiplier = rawCreditMultiplier
    ? Number(rawCreditMultiplier)
    : 1;

  // Fingerprint derived from the genesis block hash — unique per chain
  // instance. Changes whenever the chain is reset (docker compose down -v).
  const [chainFingerprint, setChainFingerprint] = useState<string | undefined>(
    undefined,
  );

  useEffect(() => {
    if (!publicClient) return;
    let cancelled = false;
    publicClient
      .getBlock({ blockNumber: 0n })
      .then((block) => {
        if (cancelled) return;
        // Use 12 hex chars (6 bytes) — short enough for a key suffix,
        // collision-resistant enough for a local cache-bust fingerprint.
        const fp = (block.hash ?? "unknown").slice(2, 14);
        sweepStaleKeys(fp);
        setChainFingerprint(fp);
      })
      .catch(() => {
        if (!cancelled) setChainFingerprint("unknown");
      });
    return () => {
      cancelled = true;
    };
  }, [publicClient]);

  useEffect(() => {
    try {
      localStorage.setItem(FORUM_STORAGE_KEY, forumName);
    } catch {
      // localStorage might be unavailable or quota exceeded
      // Silently fail to avoid breaking the app
    }
  }, [forumName]);

  const setForum = useCallback(
    (name: ForumName) => {
      setForumName(name);
    },
    [setForumName],
  );

  const syncFromSlug = useCallback((slug: string) => {
    const resolved = slugToForum(slug);
    if (resolved && isValidForumName(resolved)) {
      // Use functional setState so the callback identity is stable
      // (no dependency on forumName). This avoids a render cascade
      // where a stale closure sees the OLD forumName after setForum
      // already updated it, causing a bounce back.
      setForumName((current) => (current === resolved ? current : resolved));
    }
  }, []);

  return (
    <ForumContext.Provider
      value={{
        forumContractAddress: address,
        name: forumName,
        setForum,
        syncFromSlug,
        chainFingerprint,
        creditMultiplier,
      }}
    >
      {children}
    </ForumContext.Provider>
  );
};

export const useForum = () => {
  const state = useContext(ForumContext);
  if (!state) {
    throw new Error("useForum must be used within a ForumProvider");
  }
  return state;
};
