#!/usr/bin/env bash
set -euo pipefail

PROFILE="${1:?Usage: scripts/dev/meilisearch.sh <profile>}"

# shellcheck source=scripts/dev/profile.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/profile.sh"
load_dev_profile "${PROFILE}"

cd "${REPO_ROOT}"
exec docker compose -f docker-compose.yml up --force-recreate meilisearch