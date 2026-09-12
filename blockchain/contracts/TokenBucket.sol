// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

/**
 * @title TokenBucket
 * @notice Minimal token-bucket rate limiter. A bucket holds up to `capacity`
 *         tokens and regains one token every `intervalSeconds`. Spending a
 *         token is only allowed while the bucket is non-empty, so callers may
 *         burst up to `capacity` and then must wait for refills.
 *
 * @dev The functions are `internal pure` and operate on plain values (no
 *      storage access), so the library is inlined into the calling contract
 *      with no external-call overhead and can be unit-tested in isolation.
 *      Callers keep the {Bucket} state in their own storage.
 *
 *      Refill accounting carries the sub-interval remainder: `lastRefill`
 *      advances only by the whole intervals actually consumed, so a caller is
 *      never penalised for the exact timing of their actions. When the bucket
 *      is full, `lastRefill` snaps to the current time so an idle caller cannot
 *      bank unbounded backlog beyond `capacity`.
 */
library TokenBucket {
    struct Bucket {
        // Tokens available as of `lastRefill`.
        uint tokens;
        // Timestamp the bucket was last brought current. Zero means the bucket
        // has never been used; it is then treated as full.
        uint lastRefill;
    }

    /**
     * @notice Computes the bucket state brought current to `nowTs` without
     *         spending a token.
     * @param tokens The stored token count as of `lastRefill`.
     * @param lastRefill The stored last-refill timestamp (0 = never used).
     * @param capacity The maximum number of tokens the bucket can hold.
     * @param intervalSeconds Seconds required to regain one token.
     * @param nowTs The current timestamp.
     * @return newTokens The token count available at `nowTs` (<= capacity).
     * @return newLastRefill The last-refill timestamp after accounting for the
     *         whole intervals consumed (carrying the sub-interval remainder).
     */
    function refresh(
        uint tokens,
        uint lastRefill,
        uint capacity,
        uint intervalSeconds,
        uint nowTs
    ) internal pure returns (uint newTokens, uint newLastRefill) {
        // First-ever use: start full.
        if (lastRefill == 0) {
            return (capacity, nowTs);
        }

        uint refills = (nowTs - lastRefill) / intervalSeconds;
        uint replenished = tokens + refills;

        // Full: no partial remainder to carry, so anchor to now.
        if (replenished >= capacity) {
            return (capacity, nowTs);
        }

        // Below capacity: advance only by the whole intervals consumed so the
        // caller keeps credit for the elapsed sub-interval time.
        return (replenished, lastRefill + refills * intervalSeconds);
    }
}
