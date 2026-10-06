#!/usr/bin/env bash
set -euo pipefail

PROFILE="${1:?Usage: scripts/dev/backend.sh <profile>}"

# shellcheck source=scripts/dev/profile.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/profile.sh"
load_dev_profile "${PROFILE}"

cd "${REPO_ROOT}"
deadline=$((SECONDS + CONTRACT_READY_TIMEOUT_SECONDS))

echo "⏳ Waiting up to ${CONTRACT_READY_TIMEOUT_SECONDS}s for contract artifacts…"
until [ -f "${CONTRACT_READY_FILE}" ]; do
	if [ "${SECONDS}" -ge "${deadline}" ]; then
		echo "❌ Contract artifacts were not generated within ${CONTRACT_READY_TIMEOUT_SECONDS}s."
		echo "Expected ready marker: ${CONTRACT_READY_FILE}"
		exit 1
	fi
	sleep 1
done

exec ./scripts/local-backend.sh