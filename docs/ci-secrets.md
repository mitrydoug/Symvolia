# CI/CD Secrets Inventory

Single source of truth for the **GitHub Actions secrets** this repo consumes.
**No secret values live here — names, purpose, scope, and rotation only.** Secret
values exist only in GitHub (repository or environment secrets) and in the
upstream provider consoles.

Ground rules:

- Never print a secret value in a workflow log. The deploy scripts derive
  non-secret config from committed source and inject secrets only into the
  process environment (see `scripts/railway-backend-variables.mjs`, which prints
  provenance without values).
- Non-secret, per-network operational config is **not** a secret and lives in
  source: `deploy/backend-services.json`, `deployments/<network>.json`, and
  `env/profiles/<profile>.env`.
- `GITHUB_TOKEN` is provided automatically by GitHub Actions and is **not**
  listed below.

## Inventory

Status legend: `set` = present in GitHub · `pending` = referenced by a workflow
but not yet created (expected until the relevant phase) · `optional` = job
tolerates it being unset.

### Site publish — `deploy-site.yaml`

| Secret                 | Purpose                                                       | Scope | Status |
| ---------------------- | ------------------------------------------------------------- | ----- | ------ |
| `PINATA_JWT`           | Pinata API auth for pinning the built site to IPFS            | repo  | set    |
| `PINATA_GATEWAY`       | Pinata dedicated gateway host used for pin verification/reads | repo  | set    |
| `CLOUDFLARE_API_TOKEN` | Deploy the Cloudflare Worker (Workers-edit on the account)    | repo  | set    |

### Contract deploy / reconcile — `deploy-contracts.yaml`

| Secret                              | Purpose                                     | Scope           | Status |
| ----------------------------------- | ------------------------------------------- | --------------- | ------ |
| `BASE_SEPOLIA_RPC_URL`              | Hardhat RPC for the Base Sepolia testnet    | repo            | set    |
| `BASE_SEPOLIA_DEPLOYER_PRIVATE_KEY` | Testnet deployer key (reconcile/deploy gas) | repo            | set    |
| `BASE_RPC_URL`                      | Hardhat RPC for Base **mainnet**            | repo/production | set    |
| `BASE_DEPLOYER_PRIVATE_KEY`         | **Mainnet** deployer key (real ETH)         | repo/production | set    |

### Backend deploy (Railway) — `deploy-backend-railway.yaml`

The `deploy-development` job runs in the `development` environment; the
`deploy-production` job in `production`. Secrets may be stored at repo level or
scoped to those environments. The Railway service name and all other non-secret
config come from `deploy/backend-services.json` + `deployments/<network>.json`,
so **no GitHub _variables_ are required.**

| Secret                                        | Purpose                                    | Scope       | Status            |
| --------------------------------------------- | ------------------------------------------ | ----------- | ----------------- |
| `RAILWAY_DEVELOPMENT_TOKEN`                   | Railway project token, **dev** project     | development | set               |
| `BACKEND_RELAY_RPC_URL_DEVELOPMENT`           | Upstream RPC for the read relay (dev)      | development | set               |
| `BACKEND_GAS_SPONSORSHIP_RPC_URL_DEVELOPMENT` | RPC for gas-sponsorship eligibility (dev)  | development | set               |
| `BACKEND_MEILI_API_KEY_DEVELOPMENT`           | Meilisearch master key (dev)               | development | set               |
| `BACKEND_INDEXER_RPC_URL_DEVELOPMENT`         | RPC for the indexer (dev)                  | development | pending, optional |
| `RAILWAY_PRODUCTION_TOKEN`                    | Railway project token, **prod** project    | production  | set               |
| `BACKEND_RELAY_RPC_URL_PRODUCTION`            | Upstream RPC for the read relay (prod)     | production  | set               |
| `BACKEND_GAS_SPONSORSHIP_RPC_URL_PRODUCTION`  | RPC for gas-sponsorship eligibility (prod) | production  | set               |
| `BACKEND_MEILI_API_KEY_PRODUCTION`            | Meilisearch master key (prod)              | production  | set               |
| `BACKEND_INDEXER_RPC_URL_PRODUCTION`          | RPC for the indexer (prod)                 | production  | pending, optional |

Notes:

- `BACKEND_INDEXER_RPC_URL_*` is optional: the indexer is off for alpha
  (`INDEXER_ENABLED=false`), and the variable-sync script treats `INDEXER_RPC_URL`
  as optional — unset resolves to empty and is simply not emitted.
- `BACKEND_MEILI_API_KEY_*` is required by the variable-sync script even though
  search is off for alpha (Meilisearch stays a vestige).

## Ownership & rotation

- **Owner:** repository maintainer (single-maintainer alpha). Update this line if
  ownership is delegated.
- **Deployer private keys** (`BASE_SEPOLIA_DEPLOYER_PRIVATE_KEY`,
  `BASE_DEPLOYER_PRIVATE_KEY`): highest sensitivity. Dedicated keys, never reused
  across testnet/mainnet. Rotate by generating a new wallet and updating the
  secret; the mainnet key holds no ongoing registry privilege (autonomous
  contract), so rotation only affects future deploy/reconcile gas.
- **Provider tokens** (`RAILWAY_*_TOKEN`, `CLOUDFLARE_API_TOKEN`, `PINATA_JWT`):
  rotate from the provider console, then update the GitHub secret. Prefer minimal
  scopes (Railway: per-project token; Cloudflare: Workers-edit only).
- **RPC URLs** (`BASE_*_RPC_URL`, `BACKEND_*_RPC_URL_*`): treated as secrets
  because they embed provider API keys. Rotate by issuing a new provider key and
  updating the secret.
- **General:** no expiry is enforced by GitHub; review this inventory whenever a
  workflow gains or drops a `secrets.*` reference. Keep it in sync with
  `.github/workflows/`.
