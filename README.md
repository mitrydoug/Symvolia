# Symvolia
A platform to reflect public sentiment on important issues, ranking them by quadratic voting.

## Base Sepolia Development

Base Sepolia (`test.symvolia.org`) uses the `mock` registry mode
(`MockSymvoliaRegistry`): it runs the full zkPassport proof flow but recovers the
identity and nationality by parsing the proof parameters instead of calling an
on-chain verifier, because zkPassport has not deployed its verifier there. A
`dev` registry mode (`DevSymvoliaRegistry`, instant `register(string)`) is used
for fast local iteration. Shared deployment state is tracked in
`deployments/base_sepolia.json`; generated frontend bindings are tracked in
`frontend/src/contracts/networks/base_sepolia.ts`; and Hardhat Ignition state is
tracked under `blockchain/ignition/deployments/chain-84532`.

Use committed Base Sepolia contract addresses:

```bash
make base-sepolia
```

To deliberately deploy fresh Base Sepolia mock-registry contracts first, use the
break-glass target. This wipes the current Base Sepolia app registry and forum
state, so it is intentionally guarded:

```bash
CONFIRM_BASE_SEPOLIA_REDEPLOY=I_UNDERSTAND_THIS_WIPES_BASE_SEPOLIA_STATE make base-sepolia-break-glass
```

Required deployment variables:

```bash
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
BASE_SEPOLIA_DEPLOYER_PRIVATE_KEY=<set via Hardhat keystore or env>
```

For live backend indexing, set `BASE_SEPOLIA_INDEXER_RPC_URL` to a Base Sepolia
HTTP RPC:

```bash
BASE_SEPOLIA_INDEXER_RPC_URL=https://...
```

`BASE_SEPOLIA_RPC_URL`, `BASE_SEPOLIA_INDEXER_RPC_URL`, and
`BASE_SEPOLIA_RELAY_RPC_URL` are intentionally separate:

- `BASE_SEPOLIA_RPC_URL` is an HTTP RPC used by Hardhat deployment.
- `BASE_SEPOLIA_INDEXER_RPC_URL` is an HTTP RPC used by the backend indexer for
	pull-based log polling (mapped to `INDEXER_RPC_URL` at runtime).
- `BASE_SEPOLIA_RELAY_RPC_URL` is the upstream the backend `/rpc` relay forwards
	frontend reads to (mapped to `RELAY_RPC_URL` at runtime). The frontend points
	at the relay via `VITE_RPC_URL`; wallet writes still go through the wallet.

## Configuration layout

Config is organized in three tiers:

- **Dev secrets**: a single gitignored `env/.env.local` (see `env/.env.example`).
	Only RPC URLs are required for local dev.
- **Profiles**: committed `env/profiles/*.env` plus shared `env/.env` hold
	all non-secret config, mapping chain-specific secrets to generic runtime names.
	`env/.env` (+ `env/.env.production`) is also Vite's `envDir`, so the frontend
	build reads the same shared dir instead of separate `frontend/.env*` files.
- **Translation**: `scripts/profile-env.sh` is the single layer that combines
	secrets + profile into runtime env. Both Overmind dev and CI (`deploy-site`)
	source it. GitHub stores only Secrets; non-secret deploy values live in
	`env/profiles/develop.env` and `env/profiles/release.env`.

Local Overmind workflows load `env/.env.local` through `scripts/profile-env.sh` and
derive target-specific variables from `env/profiles/<profile>.env`. For example,
the Base Sepolia profile maps `BASE_SEPOLIA_INDEXER_RPC_URL` to `INDEXER_RPC_URL`
for the indexer and sets `VITE_RPC_URL` to the local backend relay
(`http://localhost:8000/rpc`) for the frontend. Procfiles should stay focused
on process topology rather than repeating environment mappings.

Hardhat connection targets are intentionally separate from deployment behavior.
`DEPLOY_NETWORK` selects the Hardhat network/RPC endpoint, while
`DEPLOYMENT_PROFILE` selects which Ignition deployment configuration to use. For
example, `local-mocked`, `local-stress-test`, and
`local-base-sepolia-fork` all write local runtime artifacts through the
`localhost` artifact target, but use different deployment profiles. Deployment scripts require
`DEPLOYMENT_PROFILE` to be set explicitly; use `scripts/dev/profile.sh` /
`scripts/dev/contracts.sh` or provide it in the environment for direct Hardhat
runs.

`scripts/dev/profile.sh` is the orchestration profile layer: it maps a local
workflow such as `local-mocked` or `base-sepolia` to RPC URLs, frontend network
settings, `DEPLOY_NETWORK`, `DEPLOYMENT_PROFILE`, and `SEED_PROFILE`.
`blockchain/ignition/config/deployments.ts` is the deployment topology layer:
it defines which registry type and forum contracts to deploy, plus constructor
configuration. Seed data is intentionally outside the deployment topology and is
run by `scripts/dev/contracts.sh` after deployment artifacts are generated.

Local seed behavior is controlled by `SEED_PROFILE`: `standard` registers the
small mock user set and demo content, `stress` runs the stress-test seeder, and
`none` skips seeding. Public/testnet profiles default to `none`.

Deployment profile names use kebab-case. Hardhat network names and deployment
artifact names may still use underscores where the surrounding toolchain expects
them; for example, the `base-sepolia` deployment profile deploys through the
`base_sepolia` Hardhat network and writes `deployments/base_sepolia.json`.

The `local-base-sepolia-fork` deployment profile uses a Base Sepolia fork with a
local `dev` registry for fast iteration, so it does not depend on live app state.

Contract deployment and artifact generation are a dedicated Overmind process:
`contracts: bash scripts/dev/contracts.sh <profile>`. Frontend and backend
processes wait for that process to write a per-profile readiness marker before
they serve traffic, which prevents stale generated contract files from being
used accidentally.

For Base Sepolia, `make base-sepolia` defaults to the non-deploy strategy: the
`contracts` process reads `deployments/base_sepolia.json` and regenerates runtime
artifacts from that existing deployment state. Use `make base-sepolia-break-glass`
only when you explicitly want to deploy fresh dev-registry contracts and discard
the old Base Sepolia app state.

The backend can start without `INDEXER_RPC_URL`, but live indexing is disabled
until an RPC URL is configured.

## Backend Deployment

The backend is packaged as a public container image and can be deployed with
Railway or any container host. See [deploy/README.md](deploy/README.md) for the
maintainer deployment workflow, Railway self-hosting steps, generated backend env
examples, and troubleshooting notes.

## Versioning

Symvolia uses a single user-facing app version for the whole product. The
canonical version lives in [VERSION](VERSION) at the repository root.

- `major` is for releases that break continuity for existing users, especially
	when migration is required or prior app state becomes inaccessible.
- `minor` is for new features and meaningful improvements that do not force a
	user migration.
- `patch` is for fixes, polish, and marginal improvements.

Development and non-production artifacts derive an effective version by
appending `-dev.<short-commit-sha>` to the base version from [VERSION](VERSION).
Production artifacts use the plain base version with no suffix.

GitHub releases for deployed site artifacts use version tags directly: release
deployments publish `v<version>`, and development deployments publish
`v<version>-dev.<short-sha>` as prereleases. That is advisable here because the
repo has a single user-facing version and the tag stays meaningful to users.

Update [VERSION](VERSION) manually in the same change, or in the release-prep
change, whenever the next shipped user-facing version should change. CI derives
artifact versions from that file; it does not decide major/minor/patch bumps.
