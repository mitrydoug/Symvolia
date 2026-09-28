#!/usr/bin/env bash
# Sync a Railway backend service's variables from the committed deployment JSON
# (contract addresses, RPC-relay allowlist, etc.) merged with secrets supplied
# through the environment, then trigger a redeploy.
#
# This is called by .github/workflows/deploy-backend-railway.yaml for both the
# development and production targets. It expects the Railway CLI and Node.js 20+
# to be on PATH.
#
# Required environment:
#   RAILWAY_TOKEN            Railway project token (from a GitHub secret)
#   DEPLOY_NETWORK           deployments/<DEPLOY_NETWORK>.json to derive config
#
# The Railway service to target is resolved from committed source
# (deploy/backend-services.json), so no GitHub variable is needed.
#
# Secrets consumed by scripts/railway-backend-variables.mjs (all from the
# environment; never hard-coded): RELAY_RPC_URL, GAS_SPONSORSHIP_RPC_URL,
# MEILI_API_KEY, and optionally INDEXER_RPC_URL. Non-secret operational settings
# (CORS, gas-sponsorship approval, zkPassport verifier) come from committed
# source (deploy/backend-services.json), not the environment.
set -euo pipefail

: "${RAILWAY_TOKEN:?Set RAILWAY_TOKEN (Railway project token).}"
: "${DEPLOY_NETWORK:?Set DEPLOY_NETWORK (deployments/<network>.json to use).}"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Write the merged env to a private temp file that is removed on exit. Secrets
# never touch the workspace or any uploaded artifact.
vars_file="$(mktemp)"
cleanup() { rm -f "$vars_file"; }
trap cleanup EXIT

# The generator writes the merged env to --out and prints the resolved Railway
# service name (from committed source) to stdout; provenance goes to stderr.
service_name="$(node "$repo_root/scripts/railway-backend-variables.mjs" \
  --network "$DEPLOY_NETWORK" \
  --out "$vars_file")"

if [ -z "$service_name" ]; then
  echo "Failed to resolve the Railway service name from deploy/backend-services.json." >&2
  exit 1
fi

# Build the `--set KEY=VALUE` argument list from the merged file. Values are
# single-line (enforced by the generator), so a line-by-line read is safe.
set_args=()
while IFS= read -r line; do
  [ -z "$line" ] && continue
  set_args+=(--set "$line")
done <"$vars_file"

echo "Applying ${#set_args[@]} variable pairs (values omitted) to ${service_name}..."

# `--skip-deploys` stages all changes without redeploying per-variable; we
# trigger a single redeploy afterwards so the new image + new variables go out
# together. Requires a recent Railway CLI.
railway variables \
  --service "$service_name" \
  --skip-deploys \
  "${set_args[@]}"

echo "Redeploying ${service_name}..."
railway redeploy --service "$service_name" --yes
