# Symvolia Backend Deployment

The Symvolia backend is an optional indexing and search service. Core platform
behavior remains available through the smart contracts and static frontend, but
the backend powers search, similar-statement lookup, and auxiliary webhook
experiments.

The published backend image is:

```text
ghcr.io/mitrydoug/symvolia-backend
```

Use `:develop` for the development deployment, `:release` for the production
deployment, and `:latest` only when you explicitly want the latest release image.

## Maintainer Deployment

Maintainer deployments are handled by GitHub Actions:

1. [Publish backend Docker image](../.github/workflows/publish-backend-image.yaml)
   builds `backend/Dockerfile`, smoke-tests it, and publishes branch tags to
  GHCR on pushes to `develop` and `release`. It also publishes an app-version
  tag derived from the repo-root [VERSION](../VERSION) file.
2. [Deploy backend to Railway](../.github/workflows/deploy-backend-railway.yaml)
   runs after the image publish workflow succeeds and redeploys the matching
   Railway backend environment.

Version derivation stays intentionally simple:

- `release` deployments use the plain version from [VERSION](../VERSION), such
  as `0.1.0`.
- Non-production artifacts use `<base>-dev.<short-sha>`, such as
  `0.1.0-dev.abc1234`.

The same derived version is injected into the frontend build as
`VITE_APP_VERSION` and displayed in the app UI.

Required GitHub repository configuration:

| Name                        | Type   | Purpose                                                     |
| --------------------------- | ------ | ----------------------------------------------------------- |
| `RAILWAY_DEVELOPMENT_TOKEN` | Secret | Railway project token scoped to the development environment |
| `RAILWAY_PRODUCTION_TOKEN`  | Secret | Railway project token scoped to the production environment  |

The backend RPC/Meilisearch secrets are set per environment (see
`.github/workflows/deploy-backend-railway.yaml`). All non-secret service
settings — the Railway service name, CORS origins, gas-sponsorship approval, and
the zkPassport verifier address — live in committed source
(`deploy/backend-services.json`), so no GitHub *variables* are required.

The GHCR publish workflow uses `GITHUB_TOKEN`; no Docker Hub or GHCR personal
access token is required. After the first successful publish, make the GHCR
package public so Railway and self-hosters can pull it without credentials.

## Railway Self-Hosting

The lowest-friction Railway deployment uses two services in combined mode:

1. Meilisearch with persistent storage
2. Symvolia backend from the public GHCR image

Create separate service pairs for development and production. Do not share the
same Meilisearch instance across environments because indexed documents and
contract addresses differ.

### Meilisearch Service

Create a Railway service from this Docker image:

```text
getmeili/meilisearch:v1.13
```

Attach a Railway volume at:

```text
/meili_data
```

Set variables from [railway-meilisearch.env.example](env/railway-meilisearch.env.example):

```env
PORT=7700
MEILI_ENV=production
MEILI_MASTER_KEY=replace-with-generated-master-key
```

Use `MEILI_ENV=development` for non-production deployments. Generate distinct
master keys per environment:

```bash
openssl rand -hex 32
```

If you configure a healthcheck on the Meilisearch service, use `/health`. The
`PORT=7700` value is required so Railway probes Meilisearch's actual internal
port.

### Backend Service

Create a Railway service from one of these public images:

```text
ghcr.io/mitrydoug/symvolia-backend:develop
ghcr.io/mitrydoug/symvolia-backend:release
ghcr.io/mitrydoug/symvolia-backend:latest
```

Set the backend service healthcheck path to:

```text
/health
```

Use the generated backend env example for the chain you want to index:

| Chain        | Env example                                                              |
| ------------ | ------------------------------------------------------------------------ |
| Base Sepolia | [base_sepolia.backend.env.example](env/base_sepolia.backend.env.example) |

The Base Mainnet backend env example will be generated after the first Base
Mainnet deployment creates `deployments/base.json`.

Replace placeholder values before deploying:

| Variable          | Required value                                                          |
| ----------------- | ----------------------------------------------------------------------- |
| `INDEXER_RPC_URL` | HTTP RPC URL for pull-based live indexing                               |
| `RELAY_RPC_URL`   | Upstream HTTP RPC URL the `POST /rpc` relay forwards reads to           |
| `MEILI_URL`       | Railway private URL, such as `http://meilisearch.railway.internal:7700` |
| `MEILI_API_KEY`   | Same value as the Meilisearch `MEILI_MASTER_KEY`                        |
| `CORS_ORIGINS`    | Comma-separated frontend origins allowed to call the backend            |

Optional relay policy variables:

| Variable                             | Purpose                                                                     |
| ------------------------------------ | --------------------------------------------------------------------------- |
| `RPC_RELAY_ALLOWED_METHODS`          | Comma-separated JSON-RPC methods allowed via `POST /rpc`                    |
| `RPC_RELAY_ALLOWED_CONTRACTS`        | Comma-separated contract addresses allowed for `eth_call`/`eth_estimateGas` |
| `RPC_RELAY_UPSTREAM_TIMEOUT_SECONDS` | Upstream RPC timeout in seconds                                             |

The generated contract values should usually be copied as-is. They include
`REGISTRY_MODE`, `REGISTRY_ADDRESS`, `FORUM_CONTRACT_ADDRESSES`,
and `GAS_SPONSORSHIP_REGISTRY_SIGNATURES`.

#### Gas sponsorship metering (optional)

To meter gas-sponsored actions per human with the off-chain leaky bucket, attach
a Railway **Volume** to the backend service and point the SQLite path at it:

Attach a Railway volume at:

```text
/data
```

Then set:

```env
ALCHEMY_GAS_SPONSORSHIP_INSPECT_APPROVE=true
GAS_SPONSORSHIP_RATE_LIMIT_DB=/data/sponsorship.db
GAS_SPONSORSHIP_RATE_LIMIT_CAPACITY_GAS=5000000
GAS_SPONSORSHIP_RATE_LIMIT_LEAK_GAS_PER_DAY=20000000
GAS_SPONSORSHIP_RPC_URL=https://replace-with-your-http-rpc
# Production registry mode only (proof-based registration):
ZKPASSPORT_VERIFIER_ADDRESS=0xREPLACE_WITH_ZKPASSPORT_VERIFIER_ADDRESS
```

The database is tiny (~1 MB at 10k users), so a 1 GB volume is ample and well
within the Railway Hobby plan's included volume allowance. Leave
`GAS_SPONSORSHIP_RATE_LIMIT_DB` unset to sponsor purely by function selector
without per-human limits. See [backend/README.md](../backend/README.md) for how
each action type is attributed to a zkPassport id.

Start with semantic search disabled:

```env
MEILI_SEMANTIC_SEARCH_ENABLED=false
```

After the backend and Meilisearch services are healthy, you can enable semantic
search. Meilisearch will download the configured Hugging Face model and store
model/index data in `/meili_data`, so persistent storage matters.

### Frontend Configuration

The static site is built per branch from a committed deploy profile:
`env/profiles/develop.env` (Base Sepolia) and `env/profiles/release.env` (Base).
Set the deployed backend URL, RPC relay, and gas policy there — these values are
non-secret and live in source, not GitHub Variables:

```env
VITE_BACKEND_URL=https://replace-with-your-backend-domain
VITE_ENABLE_BACKEND_SEARCH=false
VITE_RPC_URL=https://replace-with-your-backend-domain/rpc
VITE_ALCHEMY_GAS_POLICY_ID=<Alchemy Gas Manager policy ID>
```

In the Privy dashboard, enable smart wallets for the same app/client and
configure Base Sepolia and Base with their matching Alchemy paymaster policies.
In the Alchemy dashboard, make sure each gas policy allows the corresponding
frontend origin, such as `https://test.symvolia.org` for development.

If the frontend is deployed separately, update its profile and redeploy it
after the backend Railway domain is available.

## Docker Compose Self-Hosting

For non-Railway deployments, run Meilisearch and the backend with the same
environment shape:

```yaml
services:
  meilisearch:
    image: getmeili/meilisearch:v1.13
    environment:
      MEILI_ENV: production
      MEILI_MASTER_KEY: ${MEILI_MASTER_KEY}
    volumes:
      - meili_data:/meili_data

  backend:
    image: ghcr.io/mitrydoug/symvolia-backend:release
    depends_on:
      - meilisearch
    environment:
      MEILI_URL: http://meilisearch:7700
      MEILI_API_KEY: ${MEILI_MASTER_KEY}
      INDEXER_RPC_URL: ${INDEXER_RPC_URL}
      RELAY_RPC_URL: ${RELAY_RPC_URL}
      FORUM_CONTRACT_ADDRESSES: ${FORUM_CONTRACT_ADDRESSES}
      REGISTRY_MODE: ${REGISTRY_MODE}
      REGISTRY_ADDRESS: ${REGISTRY_ADDRESS}
      GAS_SPONSORSHIP_REGISTRY_SIGNATURES: ${GAS_SPONSORSHIP_REGISTRY_SIGNATURES}
      INDEXER_POLL_INTERVAL_SECONDS: ${INDEXER_POLL_INTERVAL_SECONDS}
      INDEXER_MAX_BLOCKS_PER_REQUEST: ${INDEXER_MAX_BLOCKS_PER_REQUEST}
      INDEXER_MAX_STARTUP_LOOKBACK_SECONDS: ${INDEXER_MAX_STARTUP_LOOKBACK_SECONDS}
      CORS_ORIGINS: ${CORS_ORIGINS}
    ports:
      - "8000:8000"

volumes:
  meili_data:
```

Copy one of the generated backend env examples into your deployment environment
and replace the placeholders.

## Updating Env Examples

When contract deployment JSON changes, regenerate the examples:

```bash
node scripts/generate-backend-env-examples.mjs
```

Commit the generated files with the deployment state update.

## Troubleshooting

- Meilisearch Railway healthcheck fails without `/health` logs: set `PORT=7700`
  on the Meilisearch service.
- Backend is healthy but search returns no results: verify `INDEXER_RPC_URL`,
  `FORUM_CONTRACT_ADDRESSES`, and indexer polling vars, then inspect backend
  logs for indexer startup messages.
- Railway cannot pull the backend image: make the GHCR package public or add
  private registry credentials to Railway.
- Semantic search is unavailable: keep `MEILI_SEMANTIC_SEARCH_ENABLED=false`
  until Meilisearch is healthy with a persistent volume, then enable it and allow
  extra startup time for model setup.