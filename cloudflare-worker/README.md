# Symvolia IPFS proxy (Cloudflare Worker)

A tiny Cloudflare Worker that serves the IPFS-pinned frontend from a clean
custom domain (e.g. `https://test.symvolia.org`) **without** a redirect and
without `/ipfs/<cid>` ever appearing in the address bar.

It reverse-proxies each request to your Pinata gateway
(`https://<IPFS_GATEWAY>/ipfs/<IPFS_CID><path>`), returns the response with
HTTP 200, adds a client-side-routing (SPA) fallback to `index.html`, and caches
responses at the edge keyed by the CID (so a new deploy busts the cache).

Files:

- `src/index.js` — the Worker.
- `wrangler.jsonc` — Worker config (name, entrypoint, vars, optional route).
- `package.json` — pins `wrangler`.

## Configuration

Two variables drive the Worker (set in `wrangler.jsonc` under `vars`, or in the
dashboard under **Settings → Variables and Secrets**):

| Variable       | Meaning                                                                                                                              | Example             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| `IPFS_GATEWAY` | Your Pinata gateway **custom domain** (see prerequisite below). Not the `*.mypinata.cloud` host, and not the Worker's public domain. | `ipfs.symvolia.org` |
| `IPFS_CID`     | CID of the current frontend build to serve at the site root.                                                                         | `bafybei...`        |

Get the CID from the pin step (`frontend/scripts/pin-to-ipfs.ts` prints it).

### Prerequisite: a custom domain on the Pinata gateway

Pinata refuses to serve rendered HTML/website content through the shared
`*.mypinata.cloud` gateway domain (anti-phishing), returning `ERR_ID:00023`.
Website content must be served through a **custom domain attached to the
gateway**. Because the Worker fetches from `IPFS_GATEWAY`, that value must be a
Pinata gateway custom domain — a **different** hostname from the Worker's public
domain (`test.symvolia.org`). Set one up once:

1. In Cloudflare DNS, add a record for a gateway hostname, e.g.
   `ipfs.symvolia.org`:
   - **Type** `CNAME`, **Name** `ipfs`, **Target** `your-gateway.mypinata.cloud`.
   - **Proxy status: DNS only (gray cloud)** — Pinata terminates TLS and serves
     this hostname directly.
2. In Pinata, open your gateway → **Add Custom Domain** → `ipfs.symvolia.org`
   and complete verification.
3. Confirm it serves content directly (should render, no error):
   ```sh
   curl -sI https://ipfs.symvolia.org/ipfs/<cid>/
   ```
4. Set the Worker's `IPFS_GATEWAY` to `ipfs.symvolia.org`.

The public request flow becomes:
`browser → test.symvolia.org (Worker) → ipfs.symvolia.org/ipfs/<cid> (Pinata) → 200`.
No loop, because `ipfs.symvolia.org` points at Pinata, not the Worker.

---

## Option A — Deploy with the Wrangler CLI (recommended)

From this directory (`cloudflare-worker/`):

1. Install dependencies:

   ```sh
   npm install
   ```

2. Log in to Cloudflare (opens a browser once):

   ```sh
   npx wrangler login
   ```

3. Set your values under `env.test` in `wrangler.jsonc` (`IPFS_GATEWAY` and
   `IPFS_CID`). Configuration is organized into Wrangler **environments** so one
   `src/index.js` can serve multiple sites; the `test` environment maps to
   `test.symvolia.org`. Always deploy with an explicit `--env`.

4. (Optional) Run it locally against your live gateway:

   ```sh
   npx wrangler dev --env test
   # open http://localhost:8787
   ```

   For local-only overrides you can create a `.dev.vars` file (git-ignored):

   ```
   IPFS_GATEWAY=ipfs.symvolia.org
   IPFS_CID=bafybei...
   ```

5. Deploy:

   ```sh
   npx wrangler deploy --env test
   ```

   This publishes to `test-symvolia.<your-subdomain>.workers.dev`. Visit
   that URL to confirm the site loads.

6. Attach your domain (see **Custom domain** below).

---

## Option B — Deploy via the dashboard (copy/paste)

1. Go to the Cloudflare dashboard → **Workers & Pages** → **Create** →
   **Create Worker**. Give it a name (e.g. `test-symvolia`) and deploy the
   default "Hello World".
2. Click **Edit code**, delete the template, and paste the full contents of
   [`src/index.js`](./src/index.js). Click **Deploy**.
3. Open the Worker → **Settings → Variables and Secrets** and add two plaintext
   variables: `IPFS_GATEWAY` and `IPFS_CID` (values as above). Save/redeploy.
4. Test the `*.workers.dev` URL, then attach your domain below.

---

## Custom domain (clean URL)

1. In the Worker: **Settings → Domains & Routes → Add → Custom Domain**.
2. Enter `test.symvolia.org` (later `symvolia.org` for production).
3. Cloudflare provisions TLS and creates the routing DNS record automatically.

> **Important — use two separate hostnames.** `test.symvolia.org` is the
> Worker's public domain; the Pinata gateway needs its **own** custom domain
> (e.g. `ipfs.symvolia.org`, see the prerequisite above). If you previously
> pointed `test.symvolia.org` straight at the Pinata gateway, remove that old
> `CNAME` and its "custom domain" / "set index file" config so Cloudflare can
> attach `test.symvolia.org` to the Worker. The Worker then owns
> `test.symvolia.org` and fetches internally from the Pinata custom domain
> (`ipfs.symvolia.org`) via `IPFS_GATEWAY`.

Verify the result — you should see `200` and no `Location` header:

```sh
curl -sI https://test.symvolia.org/
```

---

## Updating the site after a new build

Each deploy produces a new CID.

**Automated (default).** On the `develop` branch, `.github/workflows/deploy-site.yaml`
builds the frontend, pins it to IPFS, and then runs a `deploy-worker` job that
redeploys the test Worker with the fresh CID via
`wrangler deploy --env test --var IPFS_CID:<cid>`. `IPFS_GATEWAY` stays pinned to
`ipfs.symvolia.org` from `wrangler.jsonc`. This requires a `CLOUDFLARE_API_TOKEN`
repository secret (see below).

**Manual.** To point the Worker at a CID by hand:

- **CLI:** `npx wrangler deploy --env test --var IPFS_CID:<cid>` (or edit
  `IPFS_CID` under `env.test` in `wrangler.jsonc` first, then
  `npx wrangler deploy --env test`).
- **Dashboard:** edit the `IPFS_CID` variable and redeploy.

### CI secret: `CLOUDFLARE_API_TOKEN`

Create a scoped API token in the Cloudflare dashboard
(**My Profile → API Tokens → Create Token → Edit Cloudflare Workers**, or a
custom token with the **Account · Workers Scripts · Edit** permission for this
account) and add it to the repo as a GitHub Actions secret named
`CLOUDFLARE_API_TOKEN`. The account ID is set directly in the workflow. Moving
the CID into Workers KV would let you update it without a redeploy, if you ever
want that.

---

## Notes & limits

- **Free tier** is sufficient: Workers include 100,000 requests/day. Every asset
  a page loads counts as a request, so the Worker sets long-lived `immutable`
  cache headers on `/assets/*` and edge-caches gateway responses to minimize
  invocations. If you ever outgrow it, Workers Paid is $5/month.
- The Pinata **dedicated gateway is restricted** to CIDs pinned on your account.
  Since the frontend build is pinned there, the Worker can fetch it without any
  gateway API key. If you ever proxy un-pinned CIDs you'd need a Gateway Access
  Control.
- No container image is involved — Workers run as JS modules on Cloudflare's
  isolates.
