
.PHONY: clean
clean:
	rm -rf ignition/deployments/chain-31337
	npx hardhat clean

.PHONY: compile
compile:
	npx hardhat compile

# --- Local development deployments ---

.PHONY: deploy
deploy: clean compile
	npx hardhat run scripts/deploy.ts
	node ../scripts/generate-deployment-artifacts.mjs localhost

.PHONY: deploy-mocked
deploy-mocked: deploy

.PHONY: deploy-local-fork
deploy-local-fork: compile
	npx hardhat run scripts/deploy.ts --network local_base_sepolia_fork
	node ../scripts/generate-deployment-artifacts.mjs localhost