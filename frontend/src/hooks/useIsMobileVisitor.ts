import useIsMobile from "./useIsMobile";
import { isMobileBrowser } from "../util";

/**
 * Whether the current visitor should be treated as "mobile" (and shown the
 * mobile "coming soon" placeholder instead of the app).
 *
 * Production relies on robust user-agent detection. When
 * `VITE_ENABLE_VIEWPORT_MOBILE_DETECTION` is `"true"` — intended for dev/test
 * sites — a small viewport ALSO counts as mobile, so the placeholder can be
 * previewed via Chrome DevTools' "Toggle device toolbar" without needing the
 * browser to spoof a mobile user-agent string.
 */
const includeViewport =
  import.meta.env.VITE_ENABLE_VIEWPORT_MOBILE_DETECTION === "true";

const useIsMobileVisitor = (): boolean => {
  const isSmallViewport = useIsMobile();
  return isMobileBrowser() || (includeViewport && isSmallViewport);
};

export default useIsMobileVisitor;
