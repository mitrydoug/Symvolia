# Symvolia Blockchain

This package contains the Symvolia smart contracts, Hardhat configuration,
deployment scripts, and Solidity tests.

## Common Commands

Run Solidity tests:

```bash
npm run test:solidity
```

Compile contracts:

```bash
npx hardhat compile
```

Compile with the production optimizer profile:

```bash
npx hardhat compile --build-profile production
```

## Local Deployments

Local development workflows are normally launched from the repository root with
`make local-dev`, `make local-mocked`, `make local-forked`,
`make local-stress-test`, or `make base-sepolia`.

For direct local contract work:

```bash
make deploy
```

This deploys the local dev-registry topology to a local Hardhat network and
regenerates `deployments/localhost.json` plus frontend/backend runtime artifacts.

## Base Sepolia Break-Glass Deployment

Base Sepolia is the public test network used for development deployments. Normal
`make base-sepolia` usage reads the committed `deployments/base_sepolia.json` and
does not redeploy contracts.

To deliberately wipe and redeploy the Base Sepolia app contracts, run from the
repository root:

```bash
CONFIRM_BASE_SEPOLIA_REDEPLOY=I_UNDERSTAND_THIS_WIPES_BASE_SEPOLIA_STATE make base-sepolia-break-glass
```

This is intentionally verbose because redeploying the registry or forums wipes
their on-chain state for the app.

## Base Mainnet Production

Production targets Base Mainnet. Automatic production contract work should use
forum reconciliation only: deploy new forums that are missing from
`deployments/base.json` while preserving the existing registry and existing forum
addresses.

The initial Base Mainnet registry deployment is a migration-level operation and
must be run manually with explicit review. Before that can happen,
`ignition/parameters/base.json` must contain the approved production verifier,
scope, domain, and `devMode` values.

### Test the production flow on a Base mainnet fork (no real ETH)

Run the full production registry locally against a fork of Base mainnet. Both
targets fork from `BASE_RPC_URL` (put it in `.env.local`) and report chainId
`31337`, so their Ignition journals can never collide with the real chain-8453
state, and they spend no real ETH.

```bash
# One-shot: deploy the production profile against the fork, verify the registry
# (scope / domain / devMode / verifier) and forum wiring, and report gas.
make base-fork-dry-run

# Full local dev env (frontend + backend + relay) on the fork, running the REAL
# SymvoliaRegistry wired to the forked Base-mainnet zkPassport verifier.
make base-fork
```

`make base-fork` deploys the `base-fork` profile (registry `domain = "localhost"`,
`devMode = false`, real verifier) and serves the app with `VITE_REGISTRY_MODE=
production`. Open the frontend at `http://localhost:<port>` (not `127.0.0.1`) so
the proof's committed domain (`localhost`), subscope (`symvolia-verify`), and
chain binding (`local` = chainId `31337`) all match the deployed registry. You
can then exercise the real zkPassport registration proof against the production
verifier end to end. Import a funded Hardhat dev account into your wallet to pay
for gas (gas sponsorship is off on the local fork).

### Initial mainnet deploy (break glass)

The first real registry + forum deployment is irreversible. Run it manually from
the repository root with the explicit confirmation variable (and the deployer
env vars exported for the balance pre-check):

```bash
CONFIRM_BASE_MAINNET_DEPLOY=I_UNDERSTAND_THIS_IS_REAL_MAINNET make base-break-glass
```

This checks the deployer balance, compiles with the production profile, performs
a `FORCE_FRESH_DEPLOY` of the `base` profile to Base Mainnet, and regenerates the
deployment and backend env artifacts.

## Reconcile Missing Forums

After an initial deployment artifact exists, deploy only missing forums with:

```bash
DEPLOYMENT_PROFILE=base-sepolia npx hardhat run scripts/reconcile-forums.ts --network base_sepolia
DEPLOYMENT_PROFILE=base npx hardhat run scripts/reconcile-forums.ts --network base
```

The reconciliation script verifies existing registry/forum bytecode, refuses
forum removals, and preserves all known deployed addresses.