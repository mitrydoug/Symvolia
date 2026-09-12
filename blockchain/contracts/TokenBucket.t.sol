// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

import {TokenBucket} from "./TokenBucket.sol";

contract TokenBucketTest is Test {
    uint constant CAPACITY = 5;
    uint constant INTERVAL = 14400; // 4 hours
    uint constant NOW_TS = 1767572100;

    function testFirstUseStartsFull() external pure {
        (uint tokens, uint lastRefill) = TokenBucket.refresh(
            0,
            0,
            CAPACITY,
            INTERVAL,
            NOW_TS
        );
        assertEq(tokens, CAPACITY, "First use should start at capacity");
        assertEq(
            lastRefill,
            NOW_TS,
            "First use should anchor lastRefill to now"
        );
    }

    function testNoRefillWithinInterval() external pure {
        // Empty bucket, only half an interval elapsed: no token yet.
        (uint tokens, uint lastRefill) = TokenBucket.refresh(
            0,
            NOW_TS,
            CAPACITY,
            INTERVAL,
            NOW_TS + INTERVAL / 2
        );
        assertEq(tokens, 0, "No token before a full interval elapses");
        assertEq(lastRefill, NOW_TS, "lastRefill should not advance");
    }

    function testPartialRefillCarriesRemainder() external pure {
        // 1.5 intervals elapsed from empty: one token, remainder carried.
        (uint tokens, uint lastRefill) = TokenBucket.refresh(
            0,
            NOW_TS,
            CAPACITY,
            INTERVAL,
            NOW_TS + INTERVAL + INTERVAL / 2
        );
        assertEq(tokens, 1, "One whole interval yields one token");
        assertEq(
            lastRefill,
            NOW_TS + INTERVAL,
            "lastRefill advances by whole intervals only, carrying remainder"
        );
    }

    function testRefillCapsAtCapacityAndSnapsToNow() external pure {
        // Far longer than capacity * interval: caps and anchors to now.
        uint far = NOW_TS + INTERVAL * 100;
        (uint tokens, uint lastRefill) = TokenBucket.refresh(
            0,
            NOW_TS,
            CAPACITY,
            INTERVAL,
            far
        );
        assertEq(tokens, CAPACITY, "Should cap at capacity");
        assertEq(lastRefill, far, "Full bucket snaps lastRefill to now");
    }

    function testAlreadyFullSnapsToNow() external pure {
        (uint tokens, uint lastRefill) = TokenBucket.refresh(
            CAPACITY,
            NOW_TS,
            CAPACITY,
            INTERVAL,
            NOW_TS + INTERVAL
        );
        assertEq(tokens, CAPACITY, "Full stays full");
        assertEq(lastRefill, NOW_TS + INTERVAL, "Full bucket anchors to now");
    }

    function testPartialBucketAccumulates() external pure {
        // Start with 2 tokens, 2 intervals elapse -> 4 tokens, remainder none.
        (uint tokens, uint lastRefill) = TokenBucket.refresh(
            2,
            NOW_TS,
            CAPACITY,
            INTERVAL,
            NOW_TS + INTERVAL * 2
        );
        assertEq(tokens, 4, "Two refills added to two existing tokens");
        assertEq(
            lastRefill,
            NOW_TS + INTERVAL * 2,
            "lastRefill advances two intervals"
        );
    }
}
