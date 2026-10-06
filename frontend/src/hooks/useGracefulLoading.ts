import { useEffect, useRef, useState } from "react";

interface GracefulLoadingOptions {
  /** Grace period (ms) before showing the loading indicator. @default 250 */
  delay?: number;
  /** Minimum time (ms) the indicator stays visible once shown. @default 500 */
  minShow?: number;
}

interface GracefulLoadingResult {
  /** True while the underlying loading state is active or the minimum-show
   *  period hasn't elapsed yet. Safe to use as a guard against premature
   *  redirects / renders that depend on loaded data. */
  isLoading: boolean;
  /** True only after the grace period has elapsed and loading is still in
   *  progress (or the minimum-show period hasn't elapsed). Use this to
   *  decide whether to render a skeleton / spinner. */
  showSkeleton: boolean;
}

/**
 * Wraps a boolean loading flag with two UX refinements:
 *
 * 1. **Grace period** – the skeleton is suppressed for `delay` ms so that
 *    fast loads never flash a loading indicator.
 * 2. **Minimum show** – once the skeleton appears it stays visible for at
 *    least `minShow` ms to avoid flicker.
 *
 * Returns `{ isLoading, showSkeleton }`:
 * - `isLoading` is the *logical* loading state (true while data is
 *   unavailable, including during the minimum-show cooldown).
 * - `showSkeleton` is the *visual* loading state (true only after the
 *   grace period has elapsed).
 */
const useGracefulLoading = (
  rawIsLoading: boolean,
  { delay = 250, minShow = 500 }: GracefulLoadingOptions = {},
): GracefulLoadingResult => {
  const [showSkeleton, setShowSkeleton] = useState(false);
  const shownAtRef = useRef<number | null>(null);
  // Track whether we're in the min-show cooldown after loading finished.
  const [inCooldown, setInCooldown] = useState(false);

  useEffect(() => {
    if (rawIsLoading) {
      // Start grace-period timer
      const timer = setTimeout(() => {
        shownAtRef.current = Date.now();
        setShowSkeleton(true);
      }, delay);
      return () => clearTimeout(timer);
    }

    // Loading just finished
    if (shownAtRef.current !== null) {
      // Indicator is visible — keep it shown for at least minShow ms
      const elapsed = Date.now() - shownAtRef.current;
      const remaining = minShow - elapsed;

      if (remaining > 0) {
        setInCooldown(true);
        const timer = setTimeout(() => {
          setShowSkeleton(false);
          setInCooldown(false);
          shownAtRef.current = null;
        }, remaining);
        return () => clearTimeout(timer);
      }

      // Already shown long enough
      setShowSkeleton(false);
      shownAtRef.current = null;
    }
  }, [rawIsLoading, delay, minShow]);

  return {
    isLoading: rawIsLoading || inCooldown,
    showSkeleton,
  };
};

export default useGracefulLoading;
