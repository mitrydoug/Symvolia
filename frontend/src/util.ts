import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Avatar from "boring-avatars";

/** Convert credit parts to display credits (rounded to nearest integer). */
export const partsToCredits = (
  parts: number,
  creditMultiplier: number,
): number => Math.round(parts / creditMultiplier);

/** Convert display credits to credit parts. */
export const creditsToParts = (
  credits: number,
  creditMultiplier: number,
): number => credits * creditMultiplier;

/**
 * Quadratic credits consumed by a given support level in display credits.
 * Example: support 3 consumes 6 credits (1 + 2 + 3).
 */
export const supportCreditsToAllocatedCredits = (
  supportCredits: number,
): number => {
  const absSupportCredits = Math.abs(supportCredits);
  return (absSupportCredits * (absSupportCredits + 1)) / 2;
};

/**
 * Quadratic credits consumed by a given support level, expressed in credit parts.
 */
export const supportCreditsToAllocatedParts = (
  supportCredits: number,
  creditMultiplier: number,
): number =>
  creditsToParts(
    supportCreditsToAllocatedCredits(supportCredits),
    creditMultiplier,
  );

/**
 * Truncate an Ethereum address to `0x1a2B…3c4D` format.
 * Shows the first 6 and last 4 hex characters (industry standard).
 */
export const shortenAddress = (address: string): string =>
  `${address.slice(0, 6)}…${address.slice(-4)}`;

/**
 * Generate a deterministic Boring Avatar as an SVG data URI from an arbitrary
 * seed string (e.g. a registry `userId`). The avatar is rendered entirely
 * client-side — there is no network or API dependency. The same seed always
 * yields the same avatar, and distinct seeds yield distinct avatars.
 *
 * A square variant is used so the surrounding UI can clip the corners to the
 * desired radius (see the `MuiAvatar` rounded default in the theme).
 */
export const boringAvatarDataUri = (seed: string): string => {
  const svg = renderToStaticMarkup(
    createElement(Avatar, {
      name: seed,
      size: 80,
      variant: "marble",
      square: true,
      colors: ["#e6626f", "#efae78", "#f5e19c", "#a2ca8e", "#66af91"],
    }),
  );
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

/**
 * Detects whether the current browser is running on a mobile device, based on
 * the user-agent string. Unlike a viewport-width media query, this reliably
 * targets mobile browsers regardless of orientation or window size, which is
 * what we want while the mobile experience is unfinished.
 */
export const isMobileBrowser = (): boolean => {
  if (typeof navigator === "undefined") return false;

  const ua = navigator.userAgent || "";

  // Standard mobile/handheld user-agent signatures.
  if (/Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    return true;
  }

  // iPadOS 13+ reports a desktop Safari UA; detect it via touch support.
  return (
    /Macintosh/i.test(ua) &&
    typeof navigator.maxTouchPoints === "number" &&
    navigator.maxTouchPoints > 1
  );
};

/**
 * Format a non-negative duration (in seconds) as a short human-readable
 * countdown such as `3h 59m`, `45m`, or `30s`. Only the two most significant
 * units are shown. Returns `"0s"` for non-positive inputs.
 */
export const formatCountdown = (totalSeconds: number): string => {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  if (seconds === 0) return "0s";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
  }
  return `${secs}s`;
};
