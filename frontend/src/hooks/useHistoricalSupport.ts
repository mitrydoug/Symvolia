import { useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { useForum, FORUM_ABI } from "../state/Forum";
import { useCreditConversion } from "./useCreditConversion";
import {
  blockPollingIntervalMs,
  targetAverageBlockTimeSeconds,
} from "../wagmiConfig";
import { useBlockSync } from "./useBlockSync";

/** Average target-chain block time in seconds, used for chart block estimates. */
export const AVG_BLOCK_TIME = targetAverageBlockTimeSeconds;

/** Number of past periods to chart. */
export const PERIODS_BACK = 7;

/**
 * Duration of one chart period in seconds.
 *
 * Production default: 86 400 s (1 day)  → 7-day chart.
 * Testing override:      360 s (6 min)  → 42-minute chart.
 *
 * Controlled by the `VITE_CHART_PERIOD_SECONDS` env var.
 */
export const PERIOD_SECONDS = Number(
  import.meta.env.VITE_CHART_PERIOD_SECONDS ?? "86400",
);
const PERIOD_MS = PERIOD_SECONDS * 1000;

/** Whether we're using the production (daily) period. */
const IS_DAILY = PERIOD_SECONDS >= 86400;

// Number of blocks mined per polling interval — used to bucket currentBlockNumber
// so the React Query cache key is stable for the duration of one polling window.
const BLOCKS_PER_POLLING_INTERVAL = BigInt(
  Math.max(1, Math.ceil(blockPollingIntervalMs / 1000 / AVG_BLOCK_TIME)),
);

export interface SupportDataPoint {
  /** UTC timestamp in milliseconds. */
  timestamp: number;
  /** Net support value at that point. */
  support: number;
  /** Human-readable label for the x-axis. */
  label: string;
}

/**
 * Fetch a statement's support over the last 7 chart periods plus the
 * current value.  Returns up to 8 data points.
 *
 * The period length is controlled by `VITE_CHART_PERIOD_SECONDS`
 * (defaults to 86 400 = 1 day).  In test environments a shorter period
 * such as 360 s (6 minutes) can be used.
 *
 * Uses block-number estimation based on the configured target chain rather
 * than binary-searching for exact blocks. This is approximate but sufficient
 * for a visual chart.
 *
 * Results are cached via React Query. The cache key is bucketed to the
 * current polling window so navigating away and back within the interval
 * serves from cache without re-issuing RPC calls.
 */
export function useHistoricalSupport(statementId: bigint): {
  data: SupportDataPoint[];
  isLoading: boolean;
} {
  const publicClient = usePublicClient();
  const { forumContractAddress } = useForum();
  const { toCredits } = useCreditConversion();
  const { blockNumber: currentBlockNumber } = useBlockSync(() => {});

  // Bucket the block number to the polling window so the cache key is stable
  // for the duration of one interval — navigating away and back hits the cache.
  const cacheBlockNumber =
    currentBlockNumber !== undefined
      ? (currentBlockNumber / BLOCKS_PER_POLLING_INTERVAL) *
        BLOCKS_PER_POLLING_INTERVAL
      : undefined;

  // Build the list of target timestamps for the past PERIODS_BACK periods.
  const targets = useMemo(() => {
    const now = Date.now();
    const result: { timestamp: number; label: string }[] = [];

    if (IS_DAILY) {
      // Production: anchor to UTC noon each day.
      const todayNoonUTC = new Date(
        Date.UTC(
          new Date().getUTCFullYear(),
          new Date().getUTCMonth(),
          new Date().getUTCDate(),
          12,
        ),
      );

      for (let i = PERIODS_BACK; i >= 1; i--) {
        const t = new Date(todayNoonUTC.getTime() - i * PERIOD_MS);
        if (t.getTime() < now) {
          result.push({
            timestamp: t.getTime(),
            label: t.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              timeZone: "UTC",
            }),
          });
        }
      }

      if (todayNoonUTC.getTime() < now) {
        result.push({
          timestamp: todayNoonUTC.getTime(),
          label: todayNoonUTC.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            timeZone: "UTC",
          }),
        });
      }
    } else {
      // Test / short periods: evenly space points ending near now.
      for (let i = PERIODS_BACK; i >= 1; i--) {
        const t = now - i * PERIOD_MS;
        const minutesAgo = Math.round((now - t) / 60_000);
        result.push({
          timestamp: t,
          label:
            minutesAgo >= 60
              ? `${Math.floor(minutesAgo / 60)}h${minutesAgo % 60}m`
              : `${minutesAgo}m`,
        });
      }
    }

    return result;
  }, []);

  const { data: dataPoints = [], isPending: isLoading } = useQuery({
    queryKey: [
      "historicalSupport",
      forumContractAddress,
      statementId.toString(),
      cacheBlockNumber?.toString(),
    ],
    queryFn: async () => {
      const nowMs = Date.now();
      const currentBlock = Number(cacheBlockNumber);

      // Estimate block numbers for each target timestamp
      const queries = targets.map(({ timestamp, label }) => {
        const secondsAgo = Math.floor((nowMs - timestamp) / 1000);
        const blocksAgo = Math.max(0, Math.floor(secondsAgo / AVG_BLOCK_TIME));
        const blockNum = Math.max(0, currentBlock - blocksAgo);
        return { blockNumber: BigInt(blockNum), timestamp, label };
      });

      // Fetch support at each historical block in parallel
      const results = await Promise.all(
        queries.map(async ({ blockNumber, timestamp, label }) => {
          try {
            const data = await publicClient!.readContract({
              address: forumContractAddress,
              abi: FORUM_ABI,
              functionName: "getStatementsById",
              args: [[statementId]],
              blockNumber,
            });
            const statements = data as readonly {
              id: bigint;
              support: bigint;
            }[];
            const support =
              statements.length > 0
                ? toCredits(Number(statements[0].support))
                : 0;
            return { timestamp, support, label };
          } catch {
            // Statement may not exist at this block — skip
            return null;
          }
        }),
      );

      const points: SupportDataPoint[] = results.filter(
        (r): r is SupportDataPoint => r !== null,
      );

      // Add the current (live) data point
      try {
        const liveData = await publicClient!.readContract({
          address: forumContractAddress,
          abi: FORUM_ABI,
          functionName: "getStatementsById",
          args: [[statementId]],
        });
        const liveStatements = liveData as readonly {
          id: bigint;
          support: bigint;
        }[];
        if (liveStatements.length > 0) {
          points.push({
            timestamp: nowMs,
            support: toCredits(Number(liveStatements[0].support)),
            label: "Now",
          });
        }
      } catch {
        // Ignore — live data already shown on the card
      }

      return points;
    },
    enabled: !!publicClient && !!cacheBlockNumber && !!forumContractAddress,
  });

  // Keep a referentially stable `data` array across polling-window refetches.
  // React Query hands back a new array whenever the cache key advances (each
  // polling window), which would make Recharts replay its ~1.5s entry
  // animation even when nothing changed. Only swap the reference when the
  // actually-plotted values (labels + support) differ.
  const signature = dataPoints.map((p) => `${p.label}:${p.support}`).join("|");
  const stableDataRef = useRef<SupportDataPoint[]>(dataPoints);
  const signatureRef = useRef<string>(signature);
  if (signature !== signatureRef.current) {
    signatureRef.current = signature;
    stableDataRef.current = dataPoints;
  }

  return { data: stableDataRef.current, isLoading };
}
