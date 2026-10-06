#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Waits for an RPC endpoint + Meilisearch, then starts the backend (uvicorn).
#
# `scripts/generate-deployment-artifacts.mjs` writes backend/.generated/deployment.env
# with the FORUM_CONTRACT_ADDRESSES value for all deployed forums.
#
# Usage (called by overmind via Procfile, not directly):
#   INDEXER_RPC_URL=http://127.0.0.1:8545 \
#     MEILI_URL=http://localhost:7700 \
#     scripts/local-backend.sh
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

if [ -z "${INDEXER_RPC_URL:-}" ]; then
  echo "ℹ️  INDEXER_RPC_URL is empty — indexing disabled (search API still served)."
fi

if [ -z "${MEILI_URL:-}" ]; then
  echo "❌ MEILI_URL must be set to the Meilisearch endpoint."
  exit 1
fi

RPC_READY_TIMEOUT_SECONDS="${RPC_READY_TIMEOUT_SECONDS:-20}"
MEILI_READY_TIMEOUT_SECONDS="${MEILI_READY_TIMEOUT_SECONDS:-20}"

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
}

wait_for_meili() {
  local deadline=$((SECONDS + MEILI_READY_TIMEOUT_SECONDS))

  echo "⏳ Waiting up to ${MEILI_READY_TIMEOUT_SECONDS}s for Meilisearch at ${MEILI_URL}…"
  until curl -sf "${MEILI_URL}/health" > /dev/null 2>&1; do
    if [ "${SECONDS}" -ge "${deadline}" ]; then
      echo "❌ Meilisearch did not become ready within ${MEILI_READY_TIMEOUT_SECONDS}s: ${MEILI_URL}"
      exit 1
    fi
    sleep 1
  done
}

if [ -n "${INDEXER_RPC_URL:-}" ]; then
  wait_for_rpc
fi
wait_for_meili

# Wait for generated deployment artifacts.
DEPLOYMENT_ENV="backend/.generated/deployment.env"
echo "⏳ Waiting for contract deployment (${DEPLOYMENT_ENV})…"
until [ -f "${DEPLOYMENT_ENV}" ]; do
  sleep 2
done
# Give the artifact generator a moment to finish writing.
sleep 2

# Source the generated deployment env and export its values.
set -a
# shellcheck disable=SC1090
. "${DEPLOYMENT_ENV}"
set +a

if [ -z "${FORUM_CONTRACT_ADDRESSES:-}" ]; then
  echo "❌ Could not load FORUM_CONTRACT_ADDRESSES from ${DEPLOYMENT_ENV}"
  exit 1
fi
echo "📋 Using FORUM_CONTRACT_ADDRESSES=${FORUM_CONTRACT_ADDRESSES}"

cd backend
# Activate venv if it exists; otherwise expect system Python has deps.
if [ -f .venv/bin/activate ]; then
  # shellcheck disable=SC1091
  . .venv/bin/activate
fi

exec uvicorn symvolia.combined:app --host 127.0.0.1 --port 8000 --app-dir src
