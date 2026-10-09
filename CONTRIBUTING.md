# Contributing

## Branching model

This repo uses a two-branch promotion model:

- **`develop`** — default integration branch. All feature work merges here.
- **`release`** — tracks what is live in production. Deploys trigger off this branch.

The golden rule is about **merge method**, because it determines whether
`develop` and `release` keep a shared ancestry. Squash merges collapse history
into a brand-new single-parent commit; doing that on the `develop -> release`
promotion severs the shared history and makes the next promotion PR show
`develop`'s entire commit log. Merge commits preserve ancestry and keep the
promotion diff clean.

| PR type                            | Target    | Merge method              | Why                                                                     |
| ---------------------------------- | --------- | ------------------------- | ----------------------------------------------------------------------- |
| feature / fix → `develop`          | `develop` | **Squash and merge**      | One tidy commit per feature on the integration branch.                  |
| `develop` → `release` (promotion)  | `release` | **Create a merge commit** | Preserves shared ancestry so the next promotion only shows new commits. |
| `hotfix/*` → `release`             | `release` | **Create a merge commit** | Same reason; keeps `release` history linear-by-ancestry.                |
| `release` → `develop` (back-merge) | `develop` | **Create a merge commit** | Brings hotfixes back into `develop` without diverging.                  |

Pushes to `release` are validated by the **Enforce merge method** workflow
(`.github/workflows/enforce-merge-method.yaml`), which fails if a commit lands
on `release` with fewer than two parents (i.e. a squash/rebase/fast-forward).

## Promoting `develop` → `release`

1. Open a PR from `develop` into `release`.
2. Merge it with **Create a merge commit** (not squash).
3. Tag the release on `release`:
   ```bash
   git checkout release && git pull
   git tag vX.Y.Z
   git push origin release --tags
   ```

## Hotfix flow

1. Branch from `release` (not `develop`), since that is what's live:
   ```bash
   git checkout release && git pull
   git checkout -b hotfix/short-description release
   ```
2. Make the fix (with tests) and bump the patch version in `VERSION`.
3. Open `hotfix/* → release`, merge with **Create a merge commit**, then tag:
   ```bash
   git checkout release && git pull
   git tag vX.Y.Z && git push origin release --tags
   ```
4. **Back-merge** `release` into `develop` so the branches don't diverge:
   ```bash
   git checkout develop && git pull
   git merge release          # resolve conflicts if any
   git push origin develop
   ```
5. Delete the hotfix branch.

## GitHub repository settings

**Settings → General → Pull Requests**

- Enable **Allow squash merging** and set it as the **default** merge method
  (covers the common feature → `develop` case automatically).
- Enable **Allow merge commits** (used for promotions, hotfixes, back-merges).
- Disable **Allow rebase merging** (removes an ambiguous third option).
- Enable **Automatically delete head branches**.

> GitHub cannot enforce a specific merge method per target branch — the merge
> allowances are repository-wide. The squash default plus the **Enforce merge
> method** workflow on `release` is how we approximate it.

## Branch protection

Use a ruleset or classic branch protection rule for each branch.

**`release`**

- Require a pull request before merging (at least 1 approval).
- Require status checks to pass:
  - `PR checks` (typecheck, lint, format — see `pr-checks.yaml`)
  - `Enforce merge method / require-merge-commit`
- Require branches to be up to date before merging.
- Require conversation resolution before merging.
- Do not allow bypassing the above (or restrict bypass to admins only).
- Restrict who can push to `release` (no direct pushes; PRs only).

**`develop`**

- Require a pull request before merging (at least 1 approval).
- Require status checks to pass: `PR checks`.
- Require conversation resolution before merging.
- Allow squash merging for feature PRs (per the table above).
