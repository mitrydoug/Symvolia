// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {console} from "forge-std/console.sol";

import {DecayUtils} from "./DecayUtils.sol";

contract DecayUtilsTest is Test {
    uint constant HALF_LIFE = 604800; // 1 week in seconds

    function test_approxDecay() external pure {
        int _initialValue = 1000000000000; // 1 trillion

        assertEq(
            DecayUtils.approxDecay(_initialValue, 0),
            _initialValue,
            "0 seconds should return initial value"
        );
        assertEq(
            DecayUtils.approxDecay(_initialValue, HALF_LIFE),
            _initialValue / 2,
            "1 half-life should halve initial value"
        );
        assertEq(
            DecayUtils.approxDecay(_initialValue, HALF_LIFE * 2),
            _initialValue / 4,
            "2 half-lives should quarter initial value"
        );
        assertEq(
            DecayUtils.approxDecay(_initialValue, HALF_LIFE * 39),
            1,
            "39 halvings should bring 1e12 to 1"
        );
        assertEq(
            DecayUtils.approxDecay(_initialValue, HALF_LIFE * 40),
            0,
            "40 halvings should bring 1e12 to 0"
        );

        // Verify monotonic decay over the first half-life, sampling every ~60480 seconds
        int _last = _initialValue;
        uint _sampleInterval = HALF_LIFE / 10;
        for (uint i = 1; i <= 10; i++) {
            int _decayedValue = DecayUtils.approxDecay(
                _initialValue,
                i * _sampleInterval
            );
            assertLt(
                _decayedValue,
                _last,
                "decayed value should not increase over time"
            );
            _last = _decayedValue;
        }
    }

    function test_approxDecayNegative(uint64 _initialValue) external pure {
        int _value = int(uint256(_initialValue));
        int _negativeValue = -_value;

        int _decayedValue = DecayUtils.approxDecay(_value, 1);
        int _decayedNegativeValue = DecayUtils.approxDecay(_negativeValue, 1);
        assertEq(
            _decayedValue,
            -_decayedNegativeValue,
            "decay of negative value should be negative of decay of positive value"
        );
        assertGe(
            _decayedNegativeValue,
            _negativeValue,
            "negative value should decay towards zero"
        );
    }

    function test_singleSecondDecay() external pure {
        int _initialValue = 1000000000000; // Large enough to observe decay over 1 second
        int _decayedValue = DecayUtils.approxDecay(_initialValue, 1);
        assertLt(
            _decayedValue,
            _initialValue,
            "decayed value should be less than initial value after 1 second"
        );
    }
}
