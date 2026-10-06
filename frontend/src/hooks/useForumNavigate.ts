import { useCallback } from "react";
import { useNavigate, type NavigateOptions, type To } from "react-router-dom";
import { useForum, forumToSlug } from "../state/Forum";

/**
 * A thin wrapper around `useNavigate` that automatically prepends the current
 * forum slug to path strings. Numeric arguments (e.g. `-1` for back) are
 * passed through unchanged.
 *
 * Usage:
 * ```ts
 * const navigate = useForumNavigate();
 * navigate("/write");          // → "/<slug>/write"
 * navigate("/");               // → "/<slug>/"
 * navigate(-1);                // browser back (unchanged)
 * ```
 */
export const useForumNavigate = () => {
  const rawNavigate = useNavigate();
  const { name } = useForum();
  const slug = forumToSlug(name);

  return useCallback(
    (to: To | number, options?: NavigateOptions) => {
      if (typeof to === "number") {
        void rawNavigate(to);
        return;
      }

      // String path — prepend forum slug
      if (typeof to === "string") {
        const prefixed = to === "/" ? `/${slug}` : `/${slug}${to}`;
        void rawNavigate(prefixed, options);
        return;
      }

      // To object — prepend slug to pathname
      const pathname = to.pathname ?? "/";
      const prefixed = pathname === "/" ? `/${slug}` : `/${slug}${pathname}`;
      void rawNavigate({ ...to, pathname: prefixed }, options);
    },
    [rawNavigate, slug],
  );
};

/**
 * Build a forum-prefixed path string for use in `<Link to={…}>`.
 * Returns a function that prepends the current forum slug.
 */
export const useForumPath = () => {
  const { name } = useForum();
  const slug = forumToSlug(name);

  return useCallback(
    (path: string) => (path === "/" ? `/${slug}` : `/${slug}${path}`),
    [slug],
  );
};
