# Smart Contract Security Review — Symvolia (alpha)

Reviewer: internal (Copilot + maintainer) · Date: 2026-09-12 · Scope:
`blockchain/contracts/` (production path only). Companion to Phase 0 of
[docs/productionization-checklist.md](../docs/productionization-checklist.md).

## Scope & method

Manual review of the production contracts and their dependencies:

- `SymvoliaRegistry.sol` (production humanity registry) + `ISymvoliaRegistry.sol`
  (`ASymvoliaRegistry` base) + `Constants.sol` + `StringUtils.sol`
- `Forum.sol` (voting/credits/ranking) + `DecayUtils.sol`
- Interfaces: `IZKPassportVerifier.sol`
- Reviewed-but-out-of-production-scope (must never deploy to mainnet):
  `DevSymvoliaRegistry.sol`, `MockSymvoliaRegistry.sol`, `MockZKPassportParser.sol`

Threat focus (per request): unlimited credits, applying support without paying,
registering a fake/duplicate user, and bricking the registry/forum.

## Trust model (confirmed)

- **Ownerless / autonomous:** neither `SymvoliaRegistry` nor `Forum` has an
  owner, admin, `Ownable`/`AccessControl`, pause, or `selfdestruct`. There is no
  privileged key to steal or misuse. Good.
- **Credits are per-identity (`bytes32 userId`), not per-address.** Multiple
  addresses mapped to the same identity share one credit pool — so extra
  addresses do **not** create extra credits. This is the crux of sybil
  resistance and it holds. The corollary is Finding H-1 below.
- Sybil resistance ultimately depends on the external zkPassport verifier being
  sound and on the on-chain `verifyScopes` check. Assuming those hold, one
  passport ⇒ one `userId`.

---

## Findings summary

| ID  | Severity | Title                                                                        |
| --- | -------- | ---------------------------------------------------------------------------- |
| H-1 | High     | Registration proof is not bound to `msg.sender` → replay / hijack (✅ fixed)  |
| M-1 | Medium   | Unbounded free statement creation (spam / sponsor-gas drain) (✅ fixed)       |
| M-2 | Medium   | No way to detach a hijacked/compromised address from an identity             |
| L-1 | Low      | `getRankedStatementsPage` underflow reverts on valid-looking input (✅ fixed) |
| L-2 | Low      | Sub-threshold support rounds to zero credit cost (✅ fixed)                   |
| L-3 | Low      | Empty statement text allowed (✅ fixed)                                       |
| L-4 | Low      | Unbounded credit accumulation for dormant identities (✅ by design)           |
| L-5 | Low      | Per-user supported-statements array is O(n) per adjust (self-DoS)            |
| I-1 | Info     | Pragma version mix (`^0.8.21` vs `^0.8.28`) (✅ fixed)                        |
| I-2 | Info     | Ensure Dev/Mock registries can never be deployed to mainnet (✅ fixed)        |
| I-3 | Info     | Accounting drift between statement support and Σ user support (decay)        |
| I-4 | Info     | `verify()` is a state-changing external call before writes                   |

---

## H-1 (High) — Registration proof is not bound to the submitting address

**Status:** ✅ Fixed. `register()` now decodes
`helper.getBoundData(_params.committedInputs)` and reverts unless
`boundData.senderAddress == msg.sender` and `boundData.chainId == block.chainid`
(errors `SenderAddressMismatch` / `ChainIdMismatch`). The frontend
(`GetVerified.tsx`) binds the proof to the participant address via
`.bind("user_address", participantAddress)` and to the deployment chain via
`.bind("chain", zkPassportBindChain)` (`"base"` on mainnet, `"base_sepolia"` on
testnet, derived from `VITE_NETWORK`), replacing the hardcoded
`"ethereum_sepolia"`. Note the bound address is the **Privy smart-wallet
address** for sponsored embedded wallets (the on-chain `msg.sender` of the
sponsored userOp), which is exactly what `useWalletAuth().address` returns.
The testnet mock enforces the same binding: `MockZKPassportParser.getBoundData()`
re-implements the verifier's BIND committed-input parsing and
`MockSymvoliaRegistry.register()` reverts with the same
`SenderAddressMismatch` / `ChainIdMismatch` errors, so testnet registration
matches mainnet behaviour rather than accepting unbound proofs.

**Where:** [SymvoliaRegistry.sol](contracts/SymvoliaRegistry.sol#L33) `register()`;
identity attach logic in [ISymvoliaRegistry.sol](contracts/ISymvoliaRegistry.sol#L19)
`_registerHelper()`.

**What:** `register()` verifies the zkPassport proof, checks
`verifyScopes(publicInputs, domain, scope)`, then maps
`userIdFromAddress[msg.sender] = uniqueIdentifier`. It **never checks that the
proof was bound to `msg.sender`** (it does not call `helper.getBoundData()` at
all) and it does not check the bound `chainId`. The `uniqueIdentifier` (scoped
nullifier) is a function of the passport + scope only — it is identical no matter
who submits it.

Consequences:

1. **Proof replay (no front-running required).** Every registration proof is
   submitted as plaintext calldata. Once a victim's `register` tx is on-chain,
   anyone can read the `ProofVerificationParams` from calldata and, from a fresh
   address, call `register()` with the same params. Because the address isn't
   bound, the proof re-verifies and `_registerHelper` appends the attacker's
   address to the victim's `Registration.registeredAddresses` — i.e. the
   attacker becomes a full member **operating as the victim's identity**. The
   only limit is the proof's `validityPeriodInSeconds` (the real verifier checks
   expiry), so the replay window is however long that proof stays valid.
2. **Front-running.** An attacker who sees the victim's proof before inclusion
   can register first; the victim still registers afterward, and both addresses
   share the one identity.
3. **Shared credit pool abuse.** Since credits are keyed by `userId`, the
   attacker's address draws from and drains the victim's credit balance, can add
   statements as that identity, and cannot be removed (see M-2).
4. **Cross-chain replay.** With no `chainId` binding checked on-chain, a proof
   for one deployment can be replayed on another using the same scope.

This directly breaks the "one person = one account" integrity the whole system
depends on. Gas sponsorship makes the attack essentially free.

**Recommendation:**

- In the frontend, bind the proof to the caller's EVM address (zkPassport
  `.bind("user_address", account)`) and to the correct mainnet chain (the
  `.bind("chain", "ethereum_sepolia")` in `GetVerified.tsx` is also a separate
  bug already tracked in the checklist).
- In `register()`, decode `helper.getBoundData(_params.committedInputs)` and
  require `boundData.senderAddress == msg.sender` **and**
  `boundData.chainId == block.chainid`. Revert otherwise.
- Consider making the nullifier 1:1 with an address (reject if the
  `uniqueIdentifier` is already registered to a different address) unless
  multi-address-per-identity is an explicit product requirement — if it is,
  design an authenticated "link another address" flow rather than accepting any
  replayed proof.

---

## M-1 (Medium) — Unbounded free statement creation (✅ fixed)

**Where:** [Forum.sol](contracts/Forum.sol#L352) `addStatement()`.

**What:** Creating a statement with `_initialSupport == 0` charged **zero
credits**, so a single verified member could call `addStatement` (optionally
batched via `Multicall`) arbitrarily many times. Empty statement text was also
accepted (L-3).

**Impact:** Storage bloat (each statement persists `text` up to
`maxStatementLength`), flooding of the off-chain indexer, and — because writes
are gas-sponsored — draining of the Alchemy gas-sponsorship budget. The
per-human leaky-bucket rate limit (`GAS_SPONSORSHIP_RATE_LIMIT_*`) partially
bounded this, but one motivated verified human could still spam heavily, and the
on-chain contract imposed no cost or limit itself.

**Fix:** `addStatement` now enforces a per-identity **token-bucket** rate limit
on-chain and rejects empty text:

- Empty text reverts with `EmptyStatement` (also resolves L-3).
- Each registered identity has a statement bucket
  (`mapping(bytes32 => TokenBucket.Bucket) statementBuckets`) holding up to
  `statementBurstCapacity` tokens and regaining one every
  `statementRefillIntervalSeconds`. Both are immutable, per-forum constructor
  parameters. Production (`base`, `base-sepolia`) is configured to a burst of
  **5** with **one refill every 4 hours** (14400s).
- `_consumeStatementToken` spends one token per creation and reverts
  `StatementRateLimited(retryAfterTimestamp)` when the bucket is empty. Because
  the guard runs before any state write, a `Multicall` batch that exceeds the
  remaining allowance reverts atomically.
- The bucket math is encapsulated in the pure, inlined
  [TokenBucket](contracts/TokenBucket.sol) library (unit-tested in
  `TokenBucket.t.sol`), which carries the sub-interval remainder so users are
  not penalised for the exact timing of their actions, and caps a long-idle
  bucket at `statementBurstCapacity`.
- `getStatementAllowance()` exposes `(available, nextRefillTimestamp)` so
  clients can surface the remaining allowance and next-refill time.

Rate-limit behaviour is covered by `ForumStatementRateLimitTest` in
`Forum.t.sol` (burst-to-capacity, over-capacity revert, refill after interval,
long-idle cap, remainder carry, empty-text revert, atomic multicall revert).

**Note:** This bounds on-chain spam directly; the off-chain sponsorship rate
limiter remains a defence-in-depth layer.

---

## M-2 (Medium) — No way to detach an address from an identity

**Where:** `ASymvoliaRegistry` ([ISymvoliaRegistry.sol](contracts/ISymvoliaRegistry.sol#L14))
— there is only `_registerHelper`; no removal/rotation path.

**What:** Addresses can be added to an identity but never removed. Combined with
H-1, a hijacking attach is **permanent**: a victim has no way to evict an
attacker's address that was replayed onto their identity, and a user who loses a
key cannot revoke it.

**Impact:** Amplifies H-1 (no recovery) and is a general key-hygiene gap.

**Recommendation:** After fixing H-1 (which prevents unauthorized attaches),
consider an authenticated address-removal/rotation flow (e.g. a fresh
address-bound proof, or a signature from an already-registered address of the
same identity). Design carefully to avoid introducing griefing.

---

## L-1 (Low) — `getRankedStatementsPage` underflow revert (✅ fixed)

**Where:** [Forum.sol](contracts/Forum.sol#L184) `getRankedStatementsPage()`.

**What:** The only bound was `_start > statementCount`. When
`rankedCount < _start <= statementCount`, the branch `rankedCount - _start`
underflowed and reverted (checked arithmetic). It is a `view`, so no fund risk —
just a confusing revert instead of an empty page.

**Fix:** `getRankedStatementsPage` now returns an empty array when
`_start >= rankedCount`, so paginating to (or past) the ranked tail yields an
empty page instead of reverting. The now-unreachable `StartOutOfBounds` custom
error was removed. Covered by the `testGetRankedStatementsPage*` cases in
[Forum.t.sol](contracts/Forum.t.sol).

---

## L-2 (Low) — Sub-threshold support is free (✅ fixed)

**Where:** [Forum.sol](contracts/Forum.sol#L599) `_costOfUserSupport()`.

**What:** `absSupport * (absSupport + creditMultiplier) / (2 * creditMultiplier)`
floored to `0` for `absSupport == 1` credit part (1e-6 credit at
`creditMultiplier == 1e6`). Only that single smallest increment was free; any
`absSupport >= 2` already cost >= 1 part. Such support is economically
meaningless (`minStatementSupportToRank` is several whole credits), but a free
`adjustSupport` toggle could still consume sponsored gas and (once per
`engagementWindowSeconds`) emit `StatementEngaged`.

**Fix:** `_costOfUserSupport` now clamps any nonzero support to a minimum of one
credit part (`_cost == 0 ? 1 : _cost`), leaving `absSupport == 0` free and every
other cost unchanged (only `absSupport == 1` was ever affected). Covered by
`testCostClampsSmallestSupportToOnePart` in
[Forum.t.sol](contracts/Forum.t.sol).

---

## L-3 (Low) — Empty statement text allowed (✅ fixed)

**Where:** [Forum.sol](contracts/Forum.sol#L352) `addStatement()`.

**Fix:** `addStatement` now reverts with `EmptyStatement` when
`bytes(_statementText).length == 0` (resolved together with M-1).

---

## L-4 (Low) — Unbounded credit accumulation (✅ accepted, by design)

**Where:** [Forum.sol](contracts/Forum.sol) `_getCurrentUserBalance()` — credits
accrue `elapsedIntervals * userCreditAllowancePerInterval` with no ceiling.

**What:** A dormant identity accumulates credits indefinitely and could later
dump a large one-time support burst. Support decays (1-week half-life), which
limits lasting impact.

**Resolution:** Accepted as an **intended feature** of the credit model, not a
bug. Letting allowance bank over time is deliberate: it lets returning
participants act with accumulated weight, and support decay bounds the lasting
ranking impact of any one-time burst. No cap will be added.

---

## L-5 (Low) — O(n) per-user supported-statements scan

**Where:** [Forum.sol](contracts/Forum.sol) `_updateUserSupportedStatements()`
and `getUserStatementSupport()` iterate the full `_userSupportedStatements[user]`
array on each `adjustSupport`.

**What:** A user who supports many statements makes their own `adjustSupport`
progressively more expensive (self-DoS) and raises sponsored-gas cost. Bounded
somewhat by quadratic credit cost, but the array only grows/compacts lazily.

**Recommendation:** Fine for alpha; monitor gas. Consider a cap on distinct
concurrently-supported statements per user.

---

## Informational

- **I-1 — Pragma mix. ✅ fixed.** `IZKPassportVerifier.sol` was the sole outlier at
  `^0.8.21`; it now declares `^0.8.28` like every other contract. All contracts
  were already compiled with solc 0.8.28 (the only configured version), so this
  is a documentation/consistency fix with no bytecode change.
- **I-2 — Dev/Mock registries. ✅ fixed.** `DevSymvoliaRegistry` (address-derived
  id, no verification) and `MockSymvoliaRegistry` (no SNARK verification, no
  domain check) must never reach mainnet. The `base` profile already uses the
  production `ForumProduction` → `SymvoliaRegistry` path, but registry mode and
  target network are selected independently (profile vs `--network`). `deploy.ts`
  now fetches the chain id up front and calls
  `assertRegistryModeAllowedOnChain()`, which rejects any non-production registry
  mode on a production chain (`PRODUCTION_ONLY_CHAIN_IDS`, currently Base mainnet
  `8453`) before any transaction is broadcast. Covered by
  `test/deployment-guard.test.ts`.
- **I-3 — Accounting drift.** `statement.support` and the sum of each user's
  `userSupportMap` entries decay independently and round separately, so they can
  drift slightly over time. Not exploitable for personal credit gain, but worth
  covering with invariant/fuzz tests.
- **I-4 — `verify()` ordering.** `zkPassportVerifier.verify()` is a
  state-changing external call made before the registry writes. The verifier is
  a fixed, trusted address so reentrancy risk is low; adding a `nonReentrant`
  guard on `register()` would be cheap defense-in-depth.

---

## Recommended pre-mainnet actions (priority order)

1. ~~**Fix H-1** (address + chainId binding, verified on-chain).~~ ✅ Done.
2. ~~**Fix M-1** (charge/limit statement creation; reject empty text).~~ ✅ Done
   (per-identity token-bucket rate limit + empty-text guard; also lands L-3).
3. Decide M-2 (address recovery/rotation) — at least document the limitation for
   alpha.
4. Land L-1 (L-3 done with M-1).
5. Add invariant/fuzz tests for the ranking + credit + decay math (I-3). ~~And a
   deploy guard for I-2.~~ ✅ Deploy guard for I-2 done.
6. Re-run the full `Forum.t.sol` / registry test suites after changes and
   confirm the production verifier address/behavior on a mainnet fork.
