#! bash
cd /Users/mitchell/software/Symvolia
export DEPLOY_BRANCH=develop
case "$DEPLOY_BRANCH" in
  develop) PROFILE=develop ;;
  release) PROFILE=release ;;
  *) echo "Unsupported branch: $DEPLOY_BRANCH"; exit 1 ;;
esac
. ./scripts/profile-env.sh
load_profile_env "$PROFILE"
env | grep '^VITE_' | sort
cd frontend
npm ci
npm run typecheck
npm run lint
npm run format:check
npm run build
