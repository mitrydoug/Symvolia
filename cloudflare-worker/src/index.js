/**
 * Symvolia IPFS reverse proxy (Cloudflare Worker).
 *
 * Serves the static frontend that is pinned to IPFS at a fixed CID through a
 * clean custom domain (e.g. https://test.symvolia.org) with NO redirect and no
 * `/ipfs/<cid>` in the address bar.
 *
 * How it works:
 *   - Each request is proxied (server-side `fetch`, HTTP 200) to the Pinata
 *     gateway at `https://<IPFS_GATEWAY>/ipfs/<IPFS_CID><path>`.
 *   - Because it is a proxy and not a 301/302, the browser URL stays on the
 *     custom domain.
 *   - Unknown paths (client-side routes like /forum/usa) fall back to
 *     index.html so the SPA router can handle them.
 *   - Responses are cached at the edge, keyed by the origin URL (which includes
 *     the CID), so a new deploy (new CID) naturally busts the cache.
 *
 * Configuration (Worker vars, see wrangler.jsonc):
 *   IPFS_GATEWAY  Pinata gateway CUSTOM DOMAIN, e.g. "ipfs.symvolia.org".
 *                 Pinata will not serve HTML over the shared *.mypinata.cloud
 *                 host (ERR_ID:00023), so a gateway custom domain is required.
 *                 It must differ from this Worker's own public domain, or
 *                 requests would loop.
 *   IPFS_CID      CID of the current frontend build to serve at the root.
 */

const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
const HTML_CACHE_CONTROL = "public, max-age=0, must-revalidate";
const STATIC_CACHE_CONTROL = "public, max-age=3600";

// ── Security headers ─────────────────────────────────────────────────────────
// Content-Security-Policy is Privy's #1 production hardening requirement: it
// constrains the embedded-wallet surface against XSS, clickjacking and
// cross-site data leaks. We ship it Report-Only first (per Privy's rollout
// guidance) so any missed host surfaces as a console report instead of breaking
// the live proof → register → vote flow; set the `CSP_MODE` Worker var to
// "enforce" (per environment, in wrangler.jsonc) to emit the enforcing
// `Content-Security-Policy` header once zero legitimate violations remain.
//
// `script-src` is kept tight ('self' + Cloudflare Turnstile only) — that is the
// directive that actually blocks injected scripts. `connect-src`/`frame-src`
// are scoped to our known SDK vendors (Privy, WalletConnect, Alchemy,
// zkPassport) plus our backend. Do NOT add COOP/COEP here: they break the
// cross-origin wallet popups we rely on (see GetVerified.tsx).
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "script-src 'self' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' https://fonts.gstatic.com",
  "worker-src 'self' blob:",
  [
    "frame-src 'self'",
    "https://*.privy.io",
    "https://verify.walletconnect.com",
    "https://verify.walletconnect.org",
    "https://challenges.cloudflare.com",
  ].join(" "),
  [
    "connect-src 'self'",
    "https://*.privy.io",
    "https://*.rpc.privy.systems",
    "https://*.walletconnect.com",
    "https://*.walletconnect.org",
    "wss://*.walletconnect.com",
    "wss://*.walletconnect.org",
    "wss://*.walletlink.org",
    "https://*.g.alchemy.com",
    "https://*.zkpassport.id",
    "wss://*.zkpassport.id",
    "https://symvolia-backend-production.up.railway.app",
    "https://symvolia-backend-development.up.railway.app",
  ].join(" "),
].join("; ");

// Cheap defense-in-depth headers applied to every response. HSTS is
// intentionally omitted — Cloudflare already issues Strict-Transport-Security
// for the custom domain, so duplicating it here risks conflicting max-ages.
const SECURITY_HEADERS = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
};

export default {
  /**
   * @param {Request} request
   * @param {{ IPFS_GATEWAY?: string; IPFS_CID?: string; CSP_MODE?: string }} env
   * @param {{ waitUntil: (p: Promise<unknown>) => void }} ctx
   */
  async fetch(request, env, ctx) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      });
    }

    const gateway = env.IPFS_GATEWAY;
    const cid = env.IPFS_CID;
    if (!gateway || !cid) {
      return new Response(
        "Worker misconfigured: IPFS_GATEWAY and IPFS_CID must be set.",
        { status: 500 },
      );
    }

    const url = new URL(request.url);
    const base = `https://${gateway}/ipfs/${cid}`;

    const originResponse = await fetchFromGateway(
      base,
      url.pathname,
      url.search,
      ctx,
    );

    // SPA fallback: unknown path with no file → serve index.html at HTTP 200 so
    // the client-side router can render the route.
    if (
      originResponse.status === 404 &&
      isNavigationRequest(request, url.pathname)
    ) {
      const indexResponse = await fetchFromGateway(base, "/index.html", "", ctx);
      return withResponseHeaders(indexResponse, "/index.html", env);
    }

    return withResponseHeaders(originResponse, url.pathname, env);
  },
};

/**
 * Fetch a path from the IPFS gateway, using the edge cache keyed by the
 * CID-scoped origin URL.
 *
 * @param {string} base       `https://<gateway>/ipfs/<cid>`
 * @param {string} pathname
 * @param {string} search
 * @param {{ waitUntil: (p: Promise<unknown>) => void }} ctx
 * @returns {Promise<Response>}
 */
async function fetchFromGateway(base, pathname, search, ctx) {
  const originUrl = `${base}${pathname}${search}`;
  const cache = caches.default;
  const cacheKey = new Request(originUrl, { method: "GET" });

  const cached = await cache.match(cacheKey);
  if (cached) {
    return cached;
  }

  const response = await fetch(originUrl, { redirect: "follow" });

  // Only cache successful responses; the cache key contains the CID, so cached
  // entries are implicitly invalidated when a new build (new CID) is deployed.
  if (response.ok) {
    const cacheable = new Response(response.body, response);
    cacheable.headers.set("Cache-Control", STATIC_CACHE_CONTROL);
    ctx.waitUntil(cache.put(cacheKey, cacheable.clone()));
    return cacheable;
  }

  return response;
}

/**
 * Rewrite the browser-facing Cache-Control header based on the request path and
 * attach the security headers (single response chokepoint).
 *
 * @param {Response} response
 * @param {string} pathname
 * @param {{ CSP_MODE?: string }} env
 * @returns {Response}
 */
function withResponseHeaders(response, pathname, env) {
  const headers = new Headers(response.headers);

  if (pathname.startsWith("/assets/")) {
    // Vite emits content-hashed files under /assets/ — safe to cache forever.
    headers.set("Cache-Control", IMMUTABLE_CACHE_CONTROL);
  } else if (isHtmlPath(pathname)) {
    headers.set("Cache-Control", HTML_CACHE_CONTROL);
  } else {
    headers.set("Cache-Control", STATIC_CACHE_CONTROL);
  }

  applySecurityHeaders(headers, pathname, env);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Attach security headers at the single response chokepoint. The cheap
 * hardening headers go on every response; the Content-Security-Policy (which
 * only has meaning for a browsing context) is scoped to HTML documents. CSP is
 * Report-Only unless the environment sets `CSP_MODE=enforce`.
 *
 * @param {Headers} headers
 * @param {string} pathname
 * @param {{ CSP_MODE?: string }} env
 */
function applySecurityHeaders(headers, pathname, env) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }

  if (isHtmlPath(pathname)) {
    const cspHeader =
      env?.CSP_MODE === "enforce"
        ? "Content-Security-Policy"
        : "Content-Security-Policy-Report-Only";
    headers.set(cspHeader, CONTENT_SECURITY_POLICY);
  }
}

/**
 * @param {Request} request
 * @param {string} pathname
 * @returns {boolean}
 */
function isNavigationRequest(request, pathname) {
  const accept = request.headers.get("Accept") ?? "";
  if (accept.includes("text/html")) {
    return true;
  }
  return !hasFileExtension(pathname);
}

/**
 * @param {string} pathname
 * @returns {boolean}
 */
function isHtmlPath(pathname) {
  return pathname === "/" || pathname.endsWith(".html") || !hasFileExtension(pathname);
}

/**
 * @param {string} pathname
 * @returns {boolean}
 */
function hasFileExtension(pathname) {
  const lastSegment = pathname.split("/").pop() ?? "";
  return lastSegment.includes(".");
}
