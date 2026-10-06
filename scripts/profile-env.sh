#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Single source of truth for repo-level → runtime config translation.
#
# Loads dev secrets from env/.env.local, the shared common defaults, and the
# selected profile from env/profiles/<profile>.env. Profile files map
# chain-specific repo-level secrets (e.g. BASE_SEPOLIA_RELAY_RPC_URL) to
# generic runtime names (e.g. RELAY_RPC_URL). REQUIRE lists any repo-level
# secrets a profile cannot run without.
#
# Used by both local Overmind dev (scripts/dev/profile.sh) and CI
# (.github/workflows/deploy-site.yaml). Source it, do not execute:
#   . scripts/profile-env.sh
#   load_profile_env base-sepolia
# ──────────────────────────────────────────────────────────────────────────────

PROFILE_ENV_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILE_REPO_ROOT="$(cd "${PROFILE_ENV_DIR}/.." && pwd)"

profile_require_env() {
  name="$1"
  if [ -z "${!name:-}" ]; then
    echo "❌ ${name} must be set (required by the selected profile)." >&2
    return 1
  fi
}

_load_env_file() {
  file="$1"
  [ -f "${file}" ] || return 0
  set -a
  # shellcheck disable=SC1090
  . "${file}"
  set +a
}

load_profile_env() {
  profile="${1:?Usage: load_profile_env <profile>}"
  profile_file="${PROFILE_REPO_ROOT}/env/profiles/${profile}.env"

  if [ ! -f "${profile_file}" ]; then
    echo "❌ Unknown profile '${profile}' (no ${profile_file})." >&2
    return 1
  fi

  # Tolerate referencing unset secrets while expanding profile files.
  case "$-" in *u*) _profile_restore_nounset=1 ;; *) _profile_restore_nounset=0 ;; esac
  set +u

  _load_env_file "${PROFILE_REPO_ROOT}/env/.env.local"
  _load_env_file "${PROFILE_REPO_ROOT}/env/.env"
  _load_env_file "${profile_file}"

  export DEV_PROFILE="${profile}"

  for required in ${REQUIRE:-}; do
    profile_require_env "${required}" || return 1
  done

  [ "${_profile_restore_nounset}" = "1" ] && set -u
  return 0
}
