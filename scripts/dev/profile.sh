#!/usr/bin/env bash

DEV_SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${DEV_SCRIPTS_DIR}/../.." && pwd)"

# Single translation layer: env/profiles/<profile>.env + .env.local secrets.
# shellcheck source=scripts/profile-env.sh
. "${REPO_ROOT}/scripts/profile-env.sh"

load_dev_profile() {
  local profile="$1"

  load_profile_env "${profile}" || exit 1

  # Dev-only orchestration helpers (not part of component runtime config).
  export DEPLOY_ARTIFACT_NETWORK="${DEPLOY_ARTIFACT_NETWORK:-${VITE_NETWORK}}"
  export NETWORK_FILE_NAME="${NETWORK_FILE_NAME:-${VITE_NETWORK}}"
  export CONTRACT_READY_FILE="${CONTRACT_READY_FILE:-${REPO_ROOT}/.dev/contracts-${profile}.ready}"
}