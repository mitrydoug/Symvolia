# Symvolia Backend — Search & Indexing

The backend provides two concerns that can run together or separately:

1. **Indexer** — Polls blockchain event logs from one or more deployed forum contracts and writes documents to Meilisearch.
2. **Search API** — FastAPI service exposing a `/search` endpoint for full-text search.

## Architecture

```
┌──────────────┐       HTTP RPC       ┌──────────────┐
│  Blockchain  │ ──────────────────►  │   Indexer    │
│   (Hardhat)  │                      │              │
└──────────────┘                      └──────┬───────┘
                                             │ add_documents
                                      ┌──────▼───────┐
                                      │  Meilisearch │
                                      └──────┬───────┘
                                             │ search
                                      ┌──────▼───────┐
          HTTP  ◄─────────────────    │  Search API  │
                                      └──────────────┘
```

## Running Modes

### Combined mode (recommended for local dev & self-hosting)

Runs the indexer as a background task inside the FastAPI process:

```bash
uvicorn symvolia.combined:app --host 0.0.0.0 --port 8000 --app-dir src
```

**Environment variables:**

| Variable                                      | Required | Default                | Description                                                                                          |
| --------------------------------------------- | -------- | ---------------------- | ---------------------------------------------------------------------------------------------------- |
| `MEILI_URL`                                   | Yes      | —                      | Meilisearch URL                                                                                      |
| `MEILI_API_KEY`                               | Yes      | —                      | Meilisearch API key                                                                                  |
| `FORUM_CONTRACT_ADDRESSES`                    | Yes      | —                      | Comma-separated forum contract addresses                                                             |
| `INDEXER_RPC_URL`                             | No       | —                      | HTTP RPC URL for indexer polling (indexer disabled if unset)                                         |
| `RELAY_RPC_URL`                               | No       | —                      | Upstream HTTP RPC URL the `POST /rpc` relay forwards reads to (relay errors if unset)                |
| `LOG_LEVEL`                                   | No       | `INFO`                 | Python logging level                                                                                 |
| `INDEXER_POLL_INTERVAL_SECONDS`               | No       | `60`                   | Poll interval between new log queries                                                                |
| `INDEXER_MAX_BLOCKS_PER_REQUEST`              | No       | `600`                  | Maximum block span per `eth_getLogs` call                                                            |
| `INDEXER_MAX_STARTUP_LOOKBACK_SECONDS`        | No       | `14400`                | Startup catch-up cap (4 hours)                                                                       |
| `RPC_RELAY_ALLOWED_METHODS`                   | No       | frontend-safe defaults | Comma-separated JSON-RPC methods allowed on `POST /rpc`                                              |
| `RPC_RELAY_ALLOWED_CONTRACTS`                 | No       | forum contracts        | Comma-separated contract addresses allowed for `eth_call`/`eth_estimateGas`                          |
| `RPC_RELAY_UPSTREAM_TIMEOUT_SECONDS`          | No       | `15`                   | Timeout when proxying allowed JSON-RPC requests upstream                                             |
| `MEILI_SEMANTIC_SEARCH_ENABLED`               | No       | `false`                | Configure Meilisearch `/similar` semantic search                                                     |
| `MEILI_SEMANTIC_EMBEDDER_NAME`                | No       | `statement-text`       | Meilisearch embedder name for `/similar`                                                             |
| `MEILI_SEMANTIC_EMBEDDER_MODEL`               | No       | multilingual MiniLM    | Hugging Face model used by Meilisearch                                                               |
| `MEILI_TASK_TIMEOUT_MS`                       | No       | `300000`               | Max wait for Meilisearch setup/indexing tasks                                                        |
| `ALCHEMY_GAS_SPONSORSHIP_INSPECT_APPROVE`     | No       | `false`                | Approve Alchemy Gas Manager webhook sponsorship requests                                             |
| `GAS_SPONSORSHIP_RATE_LIMIT_DB`               | No       | —                      | Path to the SQLite leaky-bucket DB. Metering is off unless this is set (e.g. `/data/sponsorship.db`) |
| `GAS_SPONSORSHIP_RATE_LIMIT_CAPACITY_GAS`     | No       | `5000000`              | Per-human burst capacity, in gas                                                                     |
| `GAS_SPONSORSHIP_RATE_LIMIT_LEAK_GAS_PER_DAY` | No       | `20000000`             | Steady-state refill rate, in gas per day                                                             |
| `GAS_SPONSORSHIP_RPC_URL`                     | No       | `INDEXER_RPC_URL`      | RPC used to resolve a userOperation's zkPassport id when metering                                    |
| `ZKPASSPORT_VERIFIER_ADDRESS`                 | No       | —                      | zkPassport verifier address; required to meter production (proof-based) registrations                |

## Gas sponsorship metering (off-chain leaky bucket)

The `POST /alchemy/gas-policy/inspect` endpoint answers Alchemy Gas Manager
webhook policy requests: it approves a userOperation for sponsorship only when
(1) it targets a sponsored contract via an approved function selector, and
(2) the human's leaky-bucket budget has room. Rejections are expected — the
frontend falls back to a self-funded transaction — so declining is safe.

Metering is **optional and off by default**; it activates only when
`GAS_SPONSORSHIP_RATE_LIMIT_DB` points at a writable path (put this on a
persistent volume). The bucket is denominated in **gas**: each sponsored
userOperation costs the sum of its gas-limit fields (`callGasLimit`,
`verificationGasLimit`, `preVerificationGas`, and the v0.7 paymaster limits),
so a human's budget tracks the compute actually sponsored on their behalf.
Buckets are keyed by the zkPassport unique identifier so a human shares one
budget across registration and every forum:

- **Forum actions** resolve `registry.getUserIdentifier(sender)` via `eth_call`.
- **Production registration** swaps the calldata selector to `verify(...)` and
  `eth_call`s the verifier to read the `uniqueIdentifier` (simulated, so no
  on-chain side effects); requires `ZKPASSPORT_VERIFIER_ADDRESS`.
- **Mock registration** decodes the proof params from the `register((...))`
  calldata locally and reads the scoped nullifier (`publicInputs[len - 2]`), so
  no verifier RPC is needed.
- **Dev registration** reproduces `keccak256(abi.encode(sender))` locally.

The Gas Manager webhook may fire more than once per userOperation (gas
estimation and the final paymaster request), so decisions are made idempotent
per `(sender, nonce, callData)` and cached briefly to avoid double-charging.
There is no post-submission confirmation webhook from the gas policy itself; if
you later want to reconcile the bucket against on-chain outcomes, wire up
Alchemy's separate Mined/Dropped Transaction notifications.

`INDEXER_RPC_URL` must be an HTTP RPC endpoint. The indexer uses pull-based
`eth_getLogs` polling with capped request ranges and persisted cursors.

Native Procfile workflows start the combined backend through
`scripts/dev/backend.sh`, which loads the selected target profile from
`scripts/dev/profile.sh`, waits for the `contracts` Overmind process readiness
marker, then invokes `scripts/local-backend.sh`. The backend launcher requires
`INDEXER_RPC_URL` (used for both startup readiness checks and live indexing)
and `MEILI_URL`, the Meilisearch endpoint.

If you are upgrading an existing Meilisearch index from the older single-forum backend, run a full backfill or clear the `statements` index once so documents are recreated with forum-scoped IDs.

### Split mode (recommended for production scaling)

Run the indexer and API as separate processes:

```bash
# Indexer (exactly one instance)
python -m symvolia.main \
  --forum-contract-address 0x... \
  --forum-contract-address 0x... \
  --ethereum-rpc-url https://... \
  --meili-url http://... \
  --meili-api-key ...

# Search API (scale horizontally)
MEILI_URL=http://... MEILI_API_KEY=... \
  uvicorn symvolia.search_service.main:app --host 0.0.0.0 --port 8000 --app-dir src
```

## Local Development (Overmind)

From the repo root:

```bash
make local-dev
```

This starts:
- Meilisearch in Docker on port 7700
- Hardhat local node on port 8545
- Contract deployment/artifact generation as an Overmind process
- Frontend dev server on port 5173
- Combined backend (indexer + API) on port 8000

The deploy step writes a shared deployment JSON file under `deployments/`, and
`scripts/generate-deployment-artifacts.mjs` writes
`backend/.generated/deployment.env`. The backend automatically sources that file
to discover the deployed forum contract addresses.

## Self-Hosting on Railway

See the deployment guide in [deploy/README.md](../deploy/README.md), or use the button below:

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/template/symvolia)

### Railway services

For a **simple deployment** (combined mode), you need two Railway services:

1. **Meilisearch** — Use the official Meilisearch template on Railway
2. **Backend** — Use the published GHCR image or build `backend/Dockerfile`, set env vars pointing to the Meilisearch service

For **production scaling**, split into three services:

1. **Meilisearch** — Database service
2. **Indexer** — Worker process (override CMD: `python -m symvolia.main --forum-contract-address ... --forum-contract-address ... --ethereum-rpc-url ... --meili-url ... --meili-api-key ...`)
3. **Search API** — Web process (default CMD from Dockerfile)

## API Endpoints

| Method | Path                          | Description                                                                                                                                                    |
| ------ | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/`                           | Redirects to `/docs` (Swagger UI)                                                                                                                              |
| GET    | `/health`                     | Health check                                                                                                                                                   |
| GET    | `/search`                     | Forum-scoped full-text search (`?statement_text=...&forum_address=0x...`)                                                                                      |
| GET    | `/similar`                    | Forum-scoped semantic similarity (`?statement_id=1&forum_address=0x...`)                                                                                       |
| POST   | `/rpc`                        | Constrained JSON-RPC relay. Method allowlist + contract allowlist enforced via environment variables.                                                          |
| POST   | `/alchemy/gas-policy/inspect` | Temporary Alchemy Gas Manager webhook inspector. Logs request shape and returns `{ "approved": false }` unless `ALCHEMY_GAS_SPONSORSHIP_INSPECT_APPROVE=true`. |

The relay is intended for frontend read traffic. Keep writes on wallet
providers (EOA wallets or embedded smart wallets) so signing remains in the
wallet boundary.

## Alchemy Gas Sponsorship Inspection

The `/alchemy/gas-policy/inspect` endpoint is a temporary integration spike for
mapping the exact Gas Manager webhook payload and UserOperation calldata shape.
It is not the final sponsorship policy implementation.

To use it with Alchemy manually:

1. Expose the backend over HTTPS, for example with a tunnel during local testing.
2. In the Alchemy dashboard, create a Base Sepolia Gas Manager policy.
3. Add conservative built-in limits, such as a low global spend cap and low max spend per UserOperation.
4. In the policy's Custom Rules, set the webhook URL to `https://<your-host>/alchemy/gas-policy/inspect`.
5. Set `approveOnFailure` to `false` so sponsorship fails closed if the backend is unavailable.
6. Set `ALCHEMY_GAS_SPONSORSHIP_INSPECT_APPROVE=true` only for the short-lived Base Sepolia inspection run.

After a test sponsored transaction, inspect backend logs for the received
`policyId`, `chainId`, `userOperation.sender`, top-level UserOperation keys, and
redacted calldata length/prefix. Use that captured shape to implement the real
policy route that decodes allowed calls, simulates registry registration, and
enforces daily zkPassport user budgets.

When `MEILI_SEMANTIC_SEARCH_ENABLED=true`, backend startup configures a local
Hugging Face embedder in Meilisearch using
`sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` by default.
Meilisearch downloads the model artifacts on first use and generates/caches
document embeddings itself; the Python backend does not call external AI APIs or
compute vectors. Use persistent Meilisearch storage in deployed environments if
you want to avoid re-downloading the model and regenerating embeddings after
restarts.

Local `make local-*` workflows enable semantic search by default in
`scripts/local-backend.sh`. Set `MEILI_SEMANTIC_SEARCH_ENABLED=false` before
starting the stack to skip local model setup.

## Dependencies

- **[Meilisearch](https://www.meilisearch.com/)** — Full-text search engine (replaces Solr)
- **[web3.py](https://web3py.readthedocs.io/)** — Ethereum interaction
- **[FastAPI](https://fastapi.tiangolo.com/)** — HTTP API framework
- **[meilisearch-python](https://github.com/meilisearch/meilisearch-python)** — Meilisearch client
