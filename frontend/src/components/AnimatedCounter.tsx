import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box, Typography, type TypographyProps } from "@mui/material";

/** Pixel height of one digit cell – measured once, then cached. */
const FALLBACK_HEIGHT = 20;

interface AnimatedCounterProps {
  value: number;
  /** Duration of each digit roll in ms (default 400) */
  duration?: number;
  /** Typography props forwarded to each character */
  typographyProps?: Omit<TypographyProps, "children">;
}

/**
 * Displays an integer that animates digit-by-digit when the value changes.
 * Each digit column behaves like a combination-lock wheel:
 *   – value increases → every digit rolls DOWN (new digit appears from above)
 *   – value decreases → every digit rolls UP  (new digit appears from below)
 * Wrapping (e.g. 9→0 on increase) continues in the same direction.
 */
const AnimatedCounter: React.FC<AnimatedCounterProps> = ({
  value,
  duration = 400,
  typographyProps = {},
}) => {
  // Track previous value to determine scroll direction
  const prevValue = useRef(value);
  const direction: "down" | "up" = value >= prevValue.current ? "down" : "up";

  // Flash color on change: green for increase, red for decrease
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => {
    if (value !== prevValue.current) {
      const dir = value > prevValue.current ? "down" : "up";
      setFlash(dir);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash(null), duration + 300);
    }
    prevValue.current = value;
  }, [value, duration]);

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  const flashColor =
    flash === "down"
      ? "#1B5E20" // dark green
      : flash === "up"
        ? "#8B1A1A" // dark red
        : undefined;

  const chars = value.toLocaleString().split("");

  // Measure the actual rendered height of a single digit
  const [cellH, setCellH] = useState(FALLBACK_HEIGHT);
  const measRef = useCallback((node: HTMLSpanElement | null) => {
    if (node) {
      const h = node.getBoundingClientRect().height;
      if (h > 0) setCellH(h);
    }
  }, []);

  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        color: flashColor ?? "text.primary",
        transition: flash ? "color 0.15s ease-in" : "color 0.6s ease-out",
      }}
    >
      {/* Hidden measuring element */}
      <Typography
        component="span"
        {...typographyProps}
        ref={measRef}
        sx={{
          ...((typographyProps.sx as object) ?? {}),
          position: "absolute",
          visibility: "hidden",
          pointerEvents: "none",
        }}
      >
        0
      </Typography>

      {chars.map((char, i) => {
        if (!/\d/.test(char)) {
          return (
            <Typography key={`sep-${i}`} component="span" {...typographyProps}>
              {char}
            </Typography>
          );
        }

        return (
          <RollingDigit
            key={i}
            digit={Number(char)}
            direction={direction}
            duration={duration}
            cellHeight={cellH}
            typographyProps={typographyProps}
          />
        );
      })}
    </Box>
  );
};

/*
 * Strip layout (top → bottom): 9 8 7 6 5 4 3 2 1 0  (repeated 3×)
 *
 * Digit d lives at index (9 − d) within each 10-item copy.
 * Middle copy (home): indices 10–19, digit d at index 19 − d.
 *
 * Increasing value → translateY increases → strip moves down →
 *   old digit exits below, new digit enters from above.
 *   Normal:  target = 19 − d   (middle copy)
 *   Wrap (new < old): target = 9 − d (first copy, above middle)
 *
 * Decreasing value → translateY decreases → strip moves up →
 *   old digit exits above, new digit enters from below.
 *   Normal:  target = 19 − d   (middle copy)
 *   Wrap (new > old): target = 29 − d (third copy, below middle)
 *
 * After a wrap animation, we silently snap back to the middle copy.
 */

// 3 copies of [9,8,7,6,5,4,3,2,1,0]
const STRIP = Array.from({ length: 30 }, (_, i) => 9 - (i % 10));

const RollingDigit: React.FC<{
  digit: number;
  direction: "down" | "up";
  duration: number;
  cellHeight: number;
  typographyProps: Omit<TypographyProps, "children">;
}> = ({ digit, direction, duration, cellHeight, typographyProps }) => {
  const [targetIndex, setTargetIndex] = useState(19 - digit);
  const [animate, setAnimate] = useState(true);
  const prevDigit = useRef(digit);
  const snapTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => {
    const prev = prevDigit.current;
    prevDigit.current = digit;
    if (prev === digit) return;

    // Cancel any pending snap-back from a previous wrap
    if (snapTimer.current) clearTimeout(snapTimer.current);

    const wrapOnIncrease = direction === "down" && digit < prev;
    const wrapOnDecrease = direction === "up" && digit > prev;

    // Ensure transitions are enabled (snap-back may have disabled them)
    setAnimate(true);

    if (wrapOnIncrease) {
      setTargetIndex(9 - digit); // first copy – above middle
    } else if (wrapOnDecrease) {
      setTargetIndex(29 - digit); // third copy – below middle
    } else {
      setTargetIndex(19 - digit); // middle copy
    }

    // After a wrap, silently snap back to the middle copy
    if (wrapOnIncrease || wrapOnDecrease) {
      snapTimer.current = setTimeout(() => {
        setAnimate(false);
        setTargetIndex(19 - digit);
        // Wait for the no-transition render to paint, then re-enable
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setAnimate(true);
          });
        });
      }, duration + 50);
    }
  }, [digit, direction, duration]);

  // Cleanup on unmount
  useEffect(
    () => () => {
      if (snapTimer.current) clearTimeout(snapTimer.current);
    },
    [],
  );

  return (
    <Box sx={{ height: cellHeight, overflow: "hidden" }}>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          transition: animate
            ? `transform ${duration}ms cubic-bezier(0.22, 1, 0.36, 1)`
            : "none",
          transform: `translateY(${-targetIndex * cellHeight}px)`,
        }}
      >
        {STRIP.map((d, i) => (
          <Typography
            key={i}
            component="span"
            {...typographyProps}
            sx={{
              ...((typographyProps.sx as object) ?? {}),
              height: cellHeight,
              lineHeight: `${cellHeight}px`,
              textAlign: "center",
              display: "block",
            }}
          >
            {d}
          </Typography>
        ))}
      </Box>
    </Box>
  );
};

export default AnimatedCounter;
