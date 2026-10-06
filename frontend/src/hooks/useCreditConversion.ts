import { useCallback } from "react";
import { useForum } from "../state/Forum";
import { partsToCredits, creditsToParts } from "../util";

/** Returns `partsToCredits` and `creditsToParts` with the forum's creditMultiplier baked in. */
export function useCreditConversion() {
  const { creditMultiplier } = useForum();

  const toCredits = useCallback(
    (parts: number) => partsToCredits(parts, creditMultiplier),
    [creditMultiplier],
  );

  const toParts = useCallback(
    (credits: number) => creditsToParts(credits, creditMultiplier),
    [creditMultiplier],
  );

  return { toCredits, toParts };
}
