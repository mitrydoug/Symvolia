#!/usr/bin/env bash
set -euo pipefail

PROFILE="${1:?Usage: scripts/dev/hardhat.sh <profile>}"

# shellcheck source=scripts/dev/profile.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/profile.sh"
load_dev_profile "${PROFILE}"

cd "${REPO_ROOT}/blockchain"
if [ -n "${HARDHAT_NETWORK:-}" ]; then
  exec npx hardhat node --network "${HARDHAT_NETWORK}"
fi

exec npx hardhat node