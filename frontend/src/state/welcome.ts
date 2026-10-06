/**
 * First-run "welcome" screen state.
 *
 * A tiny localStorage-backed flag that records whether the visitor has seen
 * (and dismissed) the full-page welcome screen. Kept as plain functions —
 * rather than a hook — so it can be read synchronously outside of React by the
 * root redirect, mirroring `getStoredForumSlug`.
 */

const WELCOME_SEEN_KEY = "symvolia:welcome:seen";

/** True once the visitor has entered the app from the welcome screen. */
export const hasSeenWelcome = (): boolean => {
  try {
    return localStorage.getItem(WELCOME_SEEN_KEY) === "1";
  } catch {
    // Private-mode / storage-disabled browsers: treat as "seen" so we never
    // trap the user on the welcome screen.
    return true;
  }
};

/** Record that the visitor has entered the app from the welcome screen. */
export const markWelcomeSeen = (): void => {
  try {
    localStorage.setItem(WELCOME_SEEN_KEY, "1");
  } catch {
    // No-op if storage is unavailable.
  }
};
