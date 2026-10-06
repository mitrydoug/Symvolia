import { useCallback, useEffect, useRef } from "react";
import { useBlockNumber } from "wagmi";
import { blockPollingIntervalMs } from "@/wagmiConfig";

/**
 * Hook to synchronize contract data with the latest blockchain state.
 *
 * Polls the chain head every `blockPollingIntervalMs` milliseconds (configured
 * via `VITE_BLOCK_POLLING_INTERVAL_SECONDS`, default 60 s). All instances share
 * the same underlying React Query poll — the query key is identical so React
 * Query deduplicates the requests automatically.
 *
 * `refetch` is called only when the block number genuinely advances. On initial
 * mount, React Query's own fetch-on-mount (cold cache) and staleTime (warm
 * cache) handle loading — no extra RPC call is issued just because the
 * component mounted.
 *
 * Also exposes `triggerSync`, which forces an immediate block-number refetch
 * and a direct refetch of contract data. Call this after a write transaction
 * confirms so the UI updates without waiting for the next polling tick.
 *
 * @param refetch - Function to call when new state should be fetched
 */
export const useBlockSync = (refetch: () => void | Promise<unknown>) => {
  const { data: blockNumber, refetch: refetchBlockNumber } = useBlockNumber({
    query: {
      refetchInterval: blockPollingIntervalMs,
      refetchIntervalInBackground: true,
    },
  });

  // Track the last block number we acted on. Initialized to undefined so the
  // first truthy value (from mount) is recorded without calling refetch().
  const prevBlockNumber = useRef<bigint | undefined>(undefined);

  useEffect(() => {
    if (blockNumber === undefined) return;
    const prev = prevBlockNumber.current;
    prevBlockNumber.current = blockNumber;
    // Skip initial mount — only fire when the block number actually advances.
    if (prev === undefined || prev === blockNumber) return;
    void refetch();
  }, [blockNumber, refetch]);

  // Force an immediate sync by refreshing the block number. If a new block has
  // been mined since the last poll, the effect above will fire and call refetch().
  // If the block number hasn't changed there is nothing new to sync.
  const triggerSync = useCallback(() => {
    void refetchBlockNumber();
  }, [refetchBlockNumber]);

  return { blockNumber, triggerSync };
};

export default useBlockSync;
