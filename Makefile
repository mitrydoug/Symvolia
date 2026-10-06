# ── Local development (native processes + containerised Meilisearch) ─────────

.PHONY: local-setup
local-setup: ## One-time setup: install deps for all modules
	mise install
	cd frontend  && npm install
	cd blockchain && npm install
	cd backend && python -m venv .venv && . .venv/bin/activate && pip install uv && uv pip sync requirements.txt

.PHONY: local-dev
local-dev: ## Start local dev env with dev registry (instant register(string))
	overmind start -f Procfile.local-dev

.PHONY: local-mocked
local-mocked: ## Start local dev env with mocked registry (full zkPassport proof flow, no verifier)
	overmind start -f Procfile.local-mocked

.PHONY: local-stress-test
local-stress-test: ## Start local dev env with dev registry and stress-test fixture data
	overmind start -f Procfile.local-stress-test

.PHONY: local-forked
local-forked: ## Start local dev env with Base Sepolia fork (needs BASE_SEPOLIA_RPC_URL in .env.local)
	overmind start -f Procfile.local-forked

.PHONY: base-sepolia
base-sepolia: ## Start dev env against committed Base Sepolia dev-registry contracts
	overmind start -f Procfile.base-sepolia

.PHONY: base-sepolia-break-glass
base-sepolia-break-glass: ## Break glass: redeploy fresh Base Sepolia contracts; requires CONFIRM_BASE_SEPOLIA_REDEPLOY=I_UNDERSTAND_THIS_WIPES_BASE_SEPOLIA_STATE
	@test "$(CONFIRM_BASE_SEPOLIA_REDEPLOY)" = "I_UNDERSTAND_THIS_WIPES_BASE_SEPOLIA_STATE" || (echo "Set CONFIRM_BASE_SEPOLIA_REDEPLOY=I_UNDERSTAND_THIS_WIPES_BASE_SEPOLIA_STATE" && exit 1)
	cd blockchain && DEPLOYMENT_PROFILE=base-sepolia npx hardhat compile --build-profile production && FORCE_FRESH_DEPLOY=1 DEPLOYMENT_PROFILE=base-sepolia npx hardhat run scripts/deploy.ts --network base_sepolia
	node scripts/generate-deployment-artifacts.mjs base_sepolia
	node scripts/generate-backend-env-examples.mjs

# ── Base Mainnet (fork testing + production deploy) ──────────────────────────

.PHONY: base-fork
base-fork: ## Start local dev env on a Base MAINNET fork with the REAL verifier (needs BASE_RPC_URL in .env.local)
	overmind start -f Procfile.base-fork

.PHONY: base-fork-dry-run
base-fork-dry-run: ## Dry-run the production Base MAINNET deploy against a local mainnet fork (needs BASE_RPC_URL); spends no real ETH
	cd blockchain && npx hardhat compile --build-profile production && npx hardhat run scripts/fork-dry-run.ts --network local_base_mainnet_fork

.PHONY: base-break-glass
base-break-glass: ## Break glass: INITIAL fresh Base MAINNET deploy (REAL ETH, immutable); requires CONFIRM_BASE_MAINNET_DEPLOY=I_UNDERSTAND_THIS_IS_REAL_MAINNET
	@test "$(CONFIRM_BASE_MAINNET_DEPLOY)" = "I_UNDERSTAND_THIS_IS_REAL_MAINNET" || (echo "Set CONFIRM_BASE_MAINNET_DEPLOY=I_UNDERSTAND_THIS_IS_REAL_MAINNET" && exit 1)
	cd blockchain && npx tsx scripts/check-balance.ts base
	cd blockchain && DEPLOYMENT_PROFILE=base npx hardhat compile --build-profile production && FORCE_FRESH_DEPLOY=1 DEPLOYMENT_PROFILE=base npx hardhat run scripts/deploy.ts --network base
	node scripts/generate-deployment-artifacts.mjs base
	node scripts/generate-backend-env-examples.mjs

.PHONY: local-stop
local-stop: ## Stop all local dev processes and Meilisearch container
	-overmind stop 2>/dev/null || true
	docker compose -f docker-compose.yml stop meilisearch
