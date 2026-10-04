#!/usr/bin/env bash
set -euo pipefail

PROFILE="${1:?Usage: scripts/dev/contracts.sh <profile>}"

# shellcheck source=scripts/dev/profile.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/profile.sh"
load_dev_profile "${PROFILE}"

RPC_READY_TIMEOUT_SECONDS="${RPC_READY_TIMEOUT_SECONDS:-20}"

wait_for_rpc() {
  local deadline=$((SECONDS + RPC_READY_TIMEOUT_SECONDS))

  echo "⏳ Waiting up to ${RPC_READY_TIMEOUT_SECONDS}s for RPC at ${INDEXER_RPC_URL}…"
  until curl -sf \
    -H 'content-type: application/json' \
    --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
    "${INDEXER_RPC_URL}" > /dev/null 2>&1; do
    if [ "${SECONDS}" -ge "${deadline}" ]; then
      echo "❌ RPC endpoint did not become ready within ${RPC_READY_TIMEOUT_SECONDS}s: ${INDEXER_RPC_URL}"
      exit 1
    fi
    sleep 1
  done
  echo "✅ RPC endpoint is ready."
}

clear_generated_artifacts() {
  local artifact_network="$1"

  rm -f "${REPO_ROOT}/deployments/${artifact_network}.json"
  rm -f "${REPO_ROOT}/frontend/src/contracts/networks/${artifact_network}.ts"
  rm -f "${REPO_ROOT}/backend/.generated/deployment.env"
}

clear_ready_marker() {
  rm -f "${CONTRACT_READY_FILE}"
}

write_ready_marker() {
  mkdir -p "$(dirname "${CONTRACT_READY_FILE}")"
  date -u '+%Y-%m-%dT%H:%M:%SZ' > "${CONTRACT_READY_FILE}"
}

generate_artifacts() {
  local artifact_network="$1"

  node "${REPO_ROOT}/scripts/generate-deployment-artifacts.mjs" "${artifact_network}"
}

set_local_mining() {
  local automine="$1"
  local interval_ms="$2"

  if [ "${DEPLOY_NETWORK}" != "localhost" ]; then
    return
  fi

  curl -sf \
    -H 'content-type: application/json' \
    --data "{\"jsonrpc\":\"2.0\",\"method\":\"evm_setAutomine\",\"params\":[${automine}],\"id\":1}" \
    "${INDEXER_RPC_URL}" > /dev/null
  curl -sf \
    -H 'content-type: application/json' \
    --data "{\"jsonrpc\":\"2.0\",\"method\":\"evm_setIntervalMining\",\"params\":[${interval_ms}],\"id\":1}" \
    "${INDEXER_RPC_URL}" > /dev/null
}

realign_fork_clock() {
  # A Hardhat fork anchors block.timestamp to the forked block and never jumps
  # it to real wall-clock — it only advances as blocks are mined. The zkPassport
  # verifier requires block.timestamp >= the proof's generation date (within a
  # 7-day window), so a lagging fork clock reverts registration with "The proof
  # was generated outside the validity period". Snap the chain clock to real
  # "now" and enable interval mining so it keeps tracking real time while you
  # scan a passport. (Being a few seconds ahead of now is fine and desirable.)
  local now
  now="$(date +%s)"

  curl -sf \
    -H 'content-type: application/json' \
    --data "{\"jsonrpc\":\"2.0\",\"method\":\"evm_setNextBlockTimestamp\",\"params\":[${now}],\"id\":1}" \
    "${INDEXER_RPC_URL}" > /dev/null
  curl -sf \
    -H 'content-type: application/json' \
    --data '{"jsonrpc":"2.0","method":"evm_mine","params":[],"id":1}' \
    "${INDEXER_RPC_URL}" > /dev/null
  curl -sf \
    -H 'content-type: application/json' \
    --data '{"jsonrpc":"2.0","method":"evm_setIntervalMining","params":[2000],"id":1}' \
    "${INDEXER_RPC_URL}" > /dev/null

  echo "⏰ Realigned fork clock to real time + interval mining (2s) so zkPassport proofs stay inside their validity window."
}

seed_contract_state() {
  case "${SEED_PROFILE:-none}" in
    none)
      echo "🌱 Skipping contract seed data."
      ;;
    standard)
      echo "🌱 Seeding standard mock users and content…"
      set_local_mining true 0
      cd "${REPO_ROOT}/blockchain"
      set +e
      npx hardhat run scripts/seed-mock-users.ts --network "${DEPLOY_NETWORK}"
      seed_exit=$?
      if [ "${seed_exit}" -eq 0 ]; then
        npx hardhat run scripts/seed-mock-content.ts --network "${DEPLOY_NETWORK}"
        seed_exit=$?
      fi
      set -e
      cd "${REPO_ROOT}"
      set_local_mining false 12000
      if [ "${seed_exit}" -ne 0 ]; then
        exit "${seed_exit}"
      fi
      ;;
    stress)
      echo "🌱 Seeding stress-test data (forum: ${STRESS_FORUM:-USA})…"
      cd "${REPO_ROOT}/blockchain"
      npx hardhat run scripts/seed-stress.ts --network "${DEPLOY_NETWORK}"
      cd "${REPO_ROOT}"
      ;;
    *)
      echo "Unknown SEED_PROFILE: ${SEED_PROFILE}"
      exit 1
      ;;
  esac
}

idle_until_shutdown() {
  echo "✅ Contract artifacts are ready. Waiting for Overmind shutdown."
  while true; do
    sleep 3600
  done
}

cd "${REPO_ROOT}"
clear_ready_marker

case "${PROFILE}" in
  local-dev | local-mocked | local-forked | local-stress-test | base-fork)
    wait_for_rpc
    clear_generated_artifacts "${VITE_NETWORK}"

    # base-fork runs the REAL zkPassport verifier against a Base-mainnet fork,
    # whose block.timestamp otherwise lags wall-clock and fails proof validity.
    if [ "${PROFILE}" = "base-fork" ]; then
      realign_fork_clock
    fi

    echo "🚀 Deploying contracts (profile: ${DEPLOYMENT_PROFILE}, network: ${DEPLOY_NETWORK})…"
    cd "${REPO_ROOT}/blockchain"
    rm -rf ignition/deployments/chain-31337
    npx hardhat clean
    npx hardhat compile
    npx hardhat run scripts/deploy.ts --network "${DEPLOY_NETWORK}"
    cd "${REPO_ROOT}"

    generate_artifacts "${VITE_NETWORK}"
    seed_contract_state
    ;;
  base-sepolia)
    if [ "${DEPLOY_CONTRACTS:-0}" = "1" ]; then
      echo "❌ DEPLOY_CONTRACTS=1 is no longer supported for make base-sepolia."
      echo "Use: CONFIRM_BASE_SEPOLIA_REDEPLOY=I_UNDERSTAND_THIS_WIPES_BASE_SEPOLIA_STATE make base-sepolia-break-glass"
      exit 1
    fi

    echo "📄 Using existing deployment state for Base Sepolia."

    generate_artifacts "${DEPLOY_ARTIFACT_NETWORK}"
    seed_contract_state
    ;;
  *)
    echo "Unknown contracts profile: ${PROFILE}"
    exit 1
    ;;
esac

write_ready_marker
idle_until_shutdown