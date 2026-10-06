// Orchestrates the browser-local search engine: owns the search Web Worker,
// builds and refreshes per-forum indexes from chain reads, persists them to
// IndexedDB, and exposes a `search` function to the rest of the app.
//
// Indexing only runs while the user has selected the local engine in Settings.
// See docs/local-search-engine-design.md.

import {
  createContext,
  FC,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePublicClient } from "wagmi";
import type { PublicClient } from "viem";

import { useForum } from "./Forum";
import useBlockSync from "@/hooks/useBlockSync";
import { useSearchEngineMode } from "@/hooks/useSearchEngineMode";
import { useLocalSearchEngine } from "@/hooks/useLocalSearchEngine";
import { targetAverageBlockTimeSeconds, targetChain } from "@/wagmiConfig";
import {
  CONFIRMATION_BLOCKS,
  DOC_CAP,
  EMBEDDING_MODEL,
  LOOKBACK_SECONDS,
} from "@/localSearch/config";
import {
  fetchEngagedStatementIds,
  fetchRankedStatements,
  fetchStatementsByIds,
} from "@/localSearch/chain";
import {
  loadForumEmbeddings,
  loadForumIndex,
  saveForumEmbeddings,
  saveForumIndex,
} from "@/localSearch/persistence";
import { SearchWorkerClient } from "@/localSearch/workerClient";
import { HybridSearchClient } from "@/localSearch/hybridClient";
import type {
  HybridProgress,
  IndexedStatement,
  LocalEngineKind,
  SearchMode,
} from "@/localSearch/types";

interface LocalSearchContextValue {
  /** Search the current forum's local index. Returns matching statement ids. */
  search: (query: string, mode: SearchMode, limit: number) => Promise<number[]>;
  /** Whether a full index build is currently in progress. */
  isIndexing: boolean;
  /** Whether the current forum's index is ready to be queried. */
  isReady: boolean;
  /** Which browser-local engine is active. */
  engineKind: LocalEngineKind;
  /**
   * Progress of the one-time semantic index build (model download + embedding),
   * or null when not applicable (lexical engine, or nothing to compute).
   */
  indexProgress: HybridProgress | null;
}

const LocalSearchContext = createContext<LocalSearchContextValue | null>(null);

const forumKeyFor = (forumAddress: string): string =>
  `${targetChain.id}:${forumAddress.toLowerCase()}`;

const lookbackBlocks = BigInt(
  Math.ceil(LOOKBACK_SECONDS / targetAverageBlockTimeSeconds),
);

export const LocalSearchProvider: FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { forumContractAddress } = useForum();
  const publicClient = usePublicClient();
  const [engineMode] = useSearchEngineMode();
  const [engineKind] = useLocalSearchEngine();

  const [isIndexing, setIsIndexing] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [indexProgress, setIndexProgress] = useState<HybridProgress | null>(
    null,
  );

  // The lexical search worker is created once and lives for the page's lifetime.
  const workerRef = useRef<SearchWorkerClient | null>(null);
  if (workerRef.current === null) {
    workerRef.current = new SearchWorkerClient();
  }

  // The hybrid worker (and its ~30 MB model) is created lazily, only once the
  // user has actually selected semantic search, so the default lexical path
  // never fetches the Transformers.js runtime or model weights.
  const hybridRef = useRef<HybridSearchClient | null>(null);
  const getHybridClient = (): HybridSearchClient => {
    if (hybridRef.current === null) {
      hybridRef.current = new HybridSearchClient();
    }
    return hybridRef.current;
  };

  // In-memory source of truth for the active forum's documents plus sync state.
  const docsRef = useRef<Map<number, IndexedStatement>>(new Map());
  // Cached embeddings for the active forum (statement id → vector). Engine-
  // agnostic and keyed by model, so they survive lexical⇄semantic toggles.
  const embeddingsRef = useRef<Map<number, Float32Array>>(new Map());
  const lastSyncedBlockRef = useRef<bigint>(0n);
  const activeForumKeyRef = useRef<string>("");
  // Increments on every full sync so stale async steps can bail out.
  const syncTokenRef = useRef(0);

  // ── Full index build: on mount, forum change, engine switch, or local mode ──
  useEffect(() => {
    if (engineMode !== "local" || !publicClient) return;

    const forum = forumContractAddress;
    const forumKey = forumKeyFor(forum);
    const client = publicClient as unknown as PublicClient;
    const token = ++syncTokenRef.current;
    const isStale = () => token !== syncTokenRef.current;

    activeForumKeyRef.current = forumKey;
    docsRef.current = new Map();
    embeddingsRef.current = new Map();
    lastSyncedBlockRef.current = 0n;
    setIsReady(false);
    setIsIndexing(true);
    setIndexProgress(null);

    const worker = workerRef.current!;

    // Snapshot of cached vectors to seed the hybrid engine (avoids re-embedding).
    const cachedEmbeddings = () =>
      [...embeddingsRef.current.entries()].map(([id, vector]) => ({
        id,
        vector,
      }));

    // Report build progress only for the currently-active sync.
    const reportProgress = (progress: HybridProgress) => {
      if (!isStale()) setIndexProgress(progress);
    };

    // Index `docs` with the active engine, capturing any new hybrid vectors.
    const indexDocs = async (
      docs: IndexedStatement[],
      replace: boolean,
    ): Promise<void> => {
      if (engineKind === "hybrid") {
        const outcome = await getHybridClient().index(
          forumKey,
          docs,
          replace,
          cachedEmbeddings(),
          reportProgress,
        );
        for (const entry of outcome.newEmbeddings) {
          embeddingsRef.current.set(entry.id, entry.vector);
        }
      } else {
        await worker.index(forumKey, docs, replace);
      }
    };

    // Persist embeddings for the current document set (hybrid only).
    const persistEmbeddings = async (): Promise<void> => {
      if (engineKind !== "hybrid") return;
      const entries: { id: number; vector: Float32Array }[] = [];
      for (const [id, vector] of embeddingsRef.current) {
        if (docsRef.current.has(id)) entries.push({ id, vector });
      }
      await saveForumEmbeddings(forumKey, EMBEDDING_MODEL, entries);
    };

    void (async () => {
      try {
        // 0. Seed cached embeddings from IndexedDB (hybrid only).
        if (engineKind === "hybrid") {
          const cached = await loadForumEmbeddings(forumKey, EMBEDDING_MODEL);
          if (isStale()) return;
          for (const entry of cached) {
            embeddingsRef.current.set(entry.id, entry.vector);
          }
        }

        // 1. Hydrate instantly from any persisted index.
        const persisted = await loadForumIndex(forumKey);
        if (isStale()) return;
        if (persisted && persisted.documents.length > 0) {
          docsRef.current = new Map(persisted.documents.map((d) => [d.id, d]));
          await indexDocs(persisted.documents, true);
          if (isStale()) return;
          setIsReady(true);
        }

        // 2. Full sync from chain: ranked ∪ recently-engaged.
        const head = await client.getBlockNumber();
        if (isStale()) return;
        const safeHead =
          head > CONFIRMATION_BLOCKS ? head - CONFIRMATION_BLOCKS : head;
        const windowStart =
          safeHead > lookbackBlocks ? safeHead - lookbackBlocks : 0n;

        const ranked = await fetchRankedStatements(client, forum, DOC_CAP);
        if (isStale()) return;

        const engagedIds = await fetchEngagedStatementIds(
          client,
          forum,
          windowStart,
          safeHead,
        );
        if (isStale()) return;

        const rankedIds = new Set(ranked.map((d) => d.id));
        const engagedDocs = await fetchStatementsByIds(
          client,
          forum,
          engagedIds.filter((id) => !rankedIds.has(id)),
        );
        if (isStale()) return;

        // Merge (ranked take priority), dedup, cap.
        const merged = new Map<number, IndexedStatement>();
        for (const doc of ranked) merged.set(doc.id, doc);
        for (const doc of engagedDocs) {
          if (!merged.has(doc.id)) merged.set(doc.id, doc);
        }
        const mergedDocs = [...merged.values()].slice(0, DOC_CAP);

        docsRef.current = new Map(mergedDocs.map((d) => [d.id, d]));
        lastSyncedBlockRef.current = safeHead;

        await indexDocs(mergedDocs, true);
        if (isStale()) return;
        await saveForumIndex(forumKey, {
          documents: mergedDocs,
          lastSyncedBlock: safeHead.toString(),
        });
        await persistEmbeddings();

        setIsReady(true);
      } catch {
        // Leave any hydrated index in place; a later block-sync retries.
      } finally {
        if (!isStale()) {
          setIsIndexing(false);
          setIndexProgress(null);
        }
      }
    })();
  }, [engineMode, engineKind, forumContractAddress, publicClient]);

  // ── Live delta: on each block-sync tick, pull newly-engaged statements ──
  // Ranked coverage refreshes on the next full sync (forum switch / reload).
  const syncDelta = useCallback(async () => {
    if (engineMode !== "local" || !publicClient) return;

    const forum = forumContractAddress;
    const forumKey = forumKeyFor(forum);
    if (forumKey !== activeForumKeyRef.current) return;

    const from = lastSyncedBlockRef.current;
    if (from === 0n) return; // full sync not yet complete

    const client = publicClient as unknown as PublicClient;
    const worker = workerRef.current!;

    try {
      const head = await client.getBlockNumber();
      const safeHead =
        head > CONFIRMATION_BLOCKS ? head - CONFIRMATION_BLOCKS : head;
      if (safeHead <= from) return;
      if (forumKey !== activeForumKeyRef.current) return;

      const engagedIds = await fetchEngagedStatementIds(
        client,
        forum,
        from + 1n,
        safeHead,
      );
      if (forumKey !== activeForumKeyRef.current) return;

      const newIds = engagedIds.filter((id) => !docsRef.current.has(id));
      let changed = false;
      if (newIds.length > 0) {
        const docs = await fetchStatementsByIds(client, forum, newIds);
        if (forumKey !== activeForumKeyRef.current) return;
        if (docs.length > 0) {
          changed = true;
          for (const doc of docs) docsRef.current.set(doc.id, doc);
          if (engineKind === "hybrid") {
            const outcome = await getHybridClient().index(
              forumKey,
              docs,
              false,
              [],
            );
            for (const entry of outcome.newEmbeddings) {
              embeddingsRef.current.set(entry.id, entry.vector);
            }
          } else {
            await worker.index(forumKey, docs, false);
          }
        }
      }

      lastSyncedBlockRef.current = safeHead;
      // Only touch IndexedDB when statements were actually added. Persisting on
      // every block (the common no-op case) re-serializes the whole doc set —
      // and, for hybrid, re-packs the full ~3MB embedding buffer — on the main
      // thread every poll interval, which visibly janks the UI (chart hiccups,
      // laggy vote toggles). The block cursor lives in memory; a reload does a
      // full resync anyway, so skipping these writes is safe.
      if (!changed) return;
      await saveForumIndex(forumKey, {
        documents: [...docsRef.current.values()],
        lastSyncedBlock: safeHead.toString(),
      });
      if (engineKind === "hybrid") {
        const entries: { id: number; vector: Float32Array }[] = [];
        for (const [id, vector] of embeddingsRef.current) {
          if (docsRef.current.has(id)) entries.push({ id, vector });
        }
        await saveForumEmbeddings(forumKey, EMBEDDING_MODEL, entries);
      }
    } catch {
      // Transient RPC failure; the next tick retries.
    }
  }, [engineMode, engineKind, publicClient, forumContractAddress]);

  useBlockSync(syncDelta);

  const search = useCallback(
    (query: string, mode: SearchMode, limit: number): Promise<number[]> => {
      const forumKey = forumKeyFor(forumContractAddress);
      if (engineKind === "hybrid") {
        const client = hybridRef.current;
        if (!client) return Promise.resolve([]);
        return client.search(forumKey, query, mode, limit);
      }
      const worker = workerRef.current;
      if (!worker) return Promise.resolve([]);
      return worker.search(forumKey, query, mode, limit);
    },
    [forumContractAddress, engineKind],
  );

  // Memoize the context value so its identity is stable across provider
  // re-renders that don't change any of these fields. Without this, every
  // block-sync tick (and every write that advances the chain head — e.g. an
  // upvote on a local chain) produced a fresh object, re-running every
  // `useSearch` effect. For the statement page's "similar statements" panel
  // that meant re-embedding the query on the semantic engine on every vote,
  // which was the primary source of statement-page lag.
  const value = useMemo(
    () => ({ search, isIndexing, isReady, engineKind, indexProgress }),
    [search, isIndexing, isReady, engineKind, indexProgress],
  );

  return (
    <LocalSearchContext.Provider value={value}>
      {children}
    </LocalSearchContext.Provider>
  );
};

export function useLocalSearch(): LocalSearchContextValue {
  const ctx = useContext(LocalSearchContext);
  if (!ctx) {
    throw new Error(
      "useLocalSearch must be used within a <LocalSearchProvider>",
    );
  }
  return ctx;
}
