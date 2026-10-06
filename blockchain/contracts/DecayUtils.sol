// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/utils/math/Math.sol";

library DecayUtils {
    uint public constant UINT_BITS = 256;
    uint public constant HALF_LIFE_SECONDS = 604800;
    uint public constant DECAY_MULTIPLIER_BITS = 64;
    uint public constant DECAY_MULTIPLIER_1_SECOND = 0xFFFFECC5A413F413;
    uint public constant DECAY_MULTIPLIER_2_SECONDS = 0xFFFFD98B49999F18;
    uint public constant DECAY_MULTIPLIER_4_SECONDS = 0xFFFFB31698FA198E;
    uint public constant DECAY_MULTIPLIER_8_SECONDS = 0xFFFF662D490F9D14;
    uint public constant DECAY_MULTIPLIER_16_SECONDS = 0xFFFECC5AEE8CC644;
    uint public constant DECAY_MULTIPLIER_32_SECONDS = 0xFFFD98B74ECEDED3;
    uint public constant DECAY_MULTIPLIER_64_SECONDS = 0xFFFB3174646C15A4;
    uint public constant DECAY_MULTIPLIER_128_SECONDS = 0xFFF662FFE3DA026C;
    uint public constant DECAY_MULTIPLIER_256_SECONDS = 0xFFECC65C31FF220C;
    uint public constant DECAY_MULTIPLIER_512_SECONDS = 0xFFD98E29FF4932C5;
    uint public constant DECAY_MULTIPLIER_1024_SECONDS = 0xFFB32219FCB93B56;
    uint public constant DECAY_MULTIPLIER_2048_SECONDS = 0xFF665B487A5B5904;
    uint public constant DECAY_MULTIPLIER_4096_SECONDS = 0xFECD12C7421017A4;
    uint public constant DECAY_MULTIPLIER_8192_SECONDS = 0xFD9B958A7B985D12;
    uint public constant DECAY_MULTIPLIER_16384_SECONDS = 0xFB3CE4222557513F;
    uint public constant DECAY_MULTIPLIER_32768_SECONDS = 0xF69075D6B0879152;
    uint public constant DECAY_MULTIPLIER_65536_SECONDS = 0xED79F3FD63091535;
    uint public constant DECAY_MULTIPLIER_131072_SECONDS = 0xDC4B07DBB77174AA;
    uint public constant DECAY_MULTIPLIER_262144_SECONDS = 0xBD910B7F3E463D9B;
    uint public constant DECAY_MULTIPLIER_524288_SECONDS = 0x8C5F7D27E89C7121;

    /// @notice Applies exponential decay to a value over the given number of seconds.
    /// @dev Uses binary exponentiation with pre-computed fixed-point multipliers.
    ///      Half-life is 604800 seconds (1 week). Preserves sign.
    /// @param startValue The value to decay (may be negative).
    /// @param elapsedSeconds The elapsed time in seconds.
    /// @return The decayed value, rounded to nearest.
    function approxDecay(
        int startValue,
        uint elapsedSeconds
    ) internal pure returns (int) {
        if (startValue == 0) {
            return 0;
        }

        bool sign = startValue > 0;
        uint value = sign ? uint(startValue) : uint(-startValue);

        uint _halvings = elapsedSeconds / HALF_LIFE_SECONDS;
        value >>= _halvings;
        elapsedSeconds = elapsedSeconds % HALF_LIFE_SECONDS;
        if (value == 0 || elapsedSeconds == 0) {
            return sign ? int(value) : -int(value);
        }

        uint toShift = 0;
        // Compute the actual number of bits needed to represent `value`.
        // Math.log2 returns floor(log2(value)), so add 1 for the bit count.
        uint bitsUsed = Math.log2(value) + 1;

        if (elapsedSeconds >= 524288) {
            uint _overflow = 0;
            if (bitsUsed + DECAY_MULTIPLIER_BITS > UINT_BITS) {
                _overflow = bitsUsed + DECAY_MULTIPLIER_BITS - UINT_BITS;
                value >>= _overflow;
                bitsUsed -= _overflow;
            }
            value *= DECAY_MULTIPLIER_524288_SECONDS;
            bitsUsed += DECAY_MULTIPLIER_BITS;
            toShift += DECAY_MULTIPLIER_BITS - _overflow;
            elapsedSeconds -= 524288;
        }

        if (elapsedSeconds >= 262144) {
            uint _overflow = 0;
            if (bitsUsed + DECAY_MULTIPLIER_BITS > UINT_BITS) {
                _overflow = bitsUsed + DECAY_MULTIPLIER_BITS - UINT_BITS;
                value >>= _overflow;
                bitsUsed -= _overflow;
            }
            value *= DECAY_MULTIPLIER_262144_SECONDS;
            bitsUsed += DECAY_MULTIPLIER_BITS;
            toShift += DECAY_MULTIPLIER_BITS - _overflow;
            elapsedSeconds -= 262144;
        }

        if (elapsedSeconds >= 131072) {
            uint _overflow = 0;
            if (bitsUsed + DECAY_MULTIPLIER_BITS > UINT_BITS) {
                _overflow = bitsUsed + DECAY_MULTIPLIER_BITS - UINT_BITS;
                value >>= _overflow;
                bitsUsed -= _overflow;
            }
            value *= DECAY_MULTIPLIER_131072_SECONDS;
            bitsUsed += DECAY_MULTIPLIER_BITS;
            toShift += DECAY_MULTIPLIER_BITS - _overflow;
            elapsedSeconds -= 131072;
        }

        if (elapsedSeconds >= 65536) {
            uint _overflow = 0;
            if (bitsUsed + DECAY_MULTIPLIER_BITS > UINT_BITS) {
                _overflow = bitsUsed + DECAY_MULTIPLIER_BITS - UINT_BITS;
                value >>= _overflow;
                bitsUsed -= _overflow;
            }
            value *= DECAY_MULTIPLIER_65536_SECONDS;
            bitsUsed += DECAY_MULTIPLIER_BITS;
            toShift += DECAY_MULTIPLIER_BITS - _overflow;
            elapsedSeconds -= 65536;
        }

        if (elapsedSeconds >= 32768) {
            uint _overflow = 0;
            if (bitsUsed + DECAY_MULTIPLIER_BITS > UINT_BITS) {
                _overflow = bitsUsed + DECAY_MULTIPLIER_BITS - UINT_BITS;
                value >>= _overflow;
                bitsUsed -= _overflow;
            }
            value *= DECAY_MULTIPLIER_32768_SECONDS;
            bitsUsed += DECAY_MULTIPLIER_BITS;
            toShift += DECAY_MULTIPLIER_BITS - _overflow;
            elapsedSeconds -= 32768;
        }

        if (elapsedSeconds >= 16384) {
            uint _overflow = 0;
            if (bitsUsed + DECAY_MULTIPLIER_BITS > UINT_BITS) {
                _overflow = bitsUsed + DECAY_MULTIPLIER_BITS - UINT_BITS;
                value >>= _overflow;
                bitsUsed -= _overflow;
            }
            value *= DECAY_MULTIPLIER_16384_SECONDS;
            bitsUsed += DECAY_MULTIPLIER_BITS;
            toShift += DECAY_MULTIPLIER_BITS - _overflow;
            elapsedSeconds -= 16384;
        }

        if (elapsedSeconds >= 8192) {
            uint _overflow = 0;
            if (bitsUsed + DECAY_MULTIPLIER_BITS > UINT_BITS) {
                _overflow = bitsUsed + DECAY_MULTIPLIER_BITS - UINT_BITS;
                value >>= _overflow;
                bitsUsed -= _overflow;
            }
            value *= DECAY_MULTIPLIER_8192_SECONDS;
            bitsUsed += DECAY_MULTIPLIER_BITS;
            toShift += DECAY_MULTIPLIER_BITS - _overflow;
            elapsedSeconds -= 8192;
        }

        if (elapsedSeconds >= 4096) {
            uint _overflow = 0;
            if (bitsUsed + DECAY_MULTIPLIER_BITS > UINT_BITS) {
                _overflow = bitsUsed + DECAY_MULTIPLIER_BITS - UINT_BITS;
                value >>= _overflow;
                bitsUsed -= _overflow;
            }
            value *= DECAY_MULTIPLIER_4096_SECONDS;
            bitsUsed += DECAY_MULTIPLIER_BITS;
            toShift += DECAY_MULTIPLIER_BITS - _overflow;
            elapsedSeconds -= 4096;
        }

        if (elapsedSeconds >= 2048) {
            uint _overflow = 0;
            if (bitsUsed + DECAY_MULTIPLIER_BITS > UINT_BITS) {
                _overflow = bitsUsed + DECAY_MULTIPLIER_BITS - UINT_BITS;
                value >>= _overflow;
                bitsUsed -= _overflow;
            }
            value *= DECAY_MULTIPLIER_2048_SECONDS;
            bitsUsed += DECAY_MULTIPLIER_BITS;
            toShift += DECAY_MULTIPLIER_BITS - _overflow;
            elapsedSeconds -= 2048;
        }

        if (elapsedSeconds >= 1024) {
            uint _overflow = 0;
            if (bitsUsed + DECAY_MULTIPLIER_BITS > UINT_BITS) {
                _overflow = bitsUsed + DECAY_MULTIPLIER_BITS - UINT_BITS;
                value >>= _overflow;
                bitsUsed -= _overflow;
            }
            value *= DECAY_MULTIPLIER_1024_SECONDS;
            bitsUsed += DECAY_MULTIPLIER_BITS;
            toShift += DECAY_MULTIPLIER_BITS - _overflow;
            elapsedSeconds -= 1024;
        }

        if (elapsedSeconds >= 512) {
            uint _overflow = 0;
            if (bitsUsed + DECAY_MULTIPLIER_BITS > UINT_BITS) {
                _overflow = bitsUsed + DECAY_MULTIPLIER_BITS - UINT_BITS;
                value >>= _overflow;
                bitsUsed -= _overflow;
            }
            value *= DECAY_MULTIPLIER_512_SECONDS;
            bitsUsed += DECAY_MULTIPLIER_BITS;
            toShift += DECAY_MULTIPLIER_BITS - _overflow;
            elapsedSeconds -= 512;
        }

        if (elapsedSeconds >= 256) {
            uint _overflow = 0;
            if (bitsUsed + DECAY_MULTIPLIER_BITS > UINT_BITS) {
                _overflow = bitsUsed + DECAY_MULTIPLIER_BITS - UINT_BITS;
                value >>= _overflow;
                bitsUsed -= _overflow;
            }
            value *= DECAY_MULTIPLIER_256_SECONDS;
            bitsUsed += DECAY_MULTIPLIER_BITS;
            toShift += DECAY_MULTIPLIER_BITS - _overflow;
            elapsedSeconds -= 256;
        }

        if (elapsedSeconds >= 128) {
            uint _overflow = 0;
            if (bitsUsed + DECAY_MULTIPLIER_BITS > UINT_BITS) {
                _overflow = bitsUsed + DECAY_MULTIPLIER_BITS - UINT_BITS;
                value >>= _overflow;
                bitsUsed -= _overflow;
            }
            value *= DECAY_MULTIPLIER_128_SECONDS;
            bitsUsed += DECAY_MULTIPLIER_BITS;
            toShift += DECAY_MULTIPLIER_BITS - _overflow;
            elapsedSeconds -= 128;
        }

        if (elapsedSeconds >= 64) {
            uint _overflow = 0;
            if (bitsUsed + DECAY_MULTIPLIER_BITS > UINT_BITS) {
                _overflow = bitsUsed + DECAY_MULTIPLIER_BITS - UINT_BITS;
                value >>= _overflow;
                bitsUsed -= _overflow;
            }
            value *= DECAY_MULTIPLIER_64_SECONDS;
            bitsUsed += DECAY_MULTIPLIER_BITS;
            toShift += DECAY_MULTIPLIER_BITS - _overflow;
            elapsedSeconds -= 64;
        }

        if (elapsedSeconds >= 32) {
            uint _overflow = 0;
            if (bitsUsed + DECAY_MULTIPLIER_BITS > UINT_BITS) {
                _overflow = bitsUsed + DECAY_MULTIPLIER_BITS - UINT_BITS;
                value >>= _overflow;
                bitsUsed -= _overflow;
            }
            value *= DECAY_MULTIPLIER_32_SECONDS;
            bitsUsed += DECAY_MULTIPLIER_BITS;
            toShift += DECAY_MULTIPLIER_BITS - _overflow;
            elapsedSeconds -= 32;
        }

        if (elapsedSeconds >= 16) {
            uint _overflow = 0;
            if (bitsUsed + DECAY_MULTIPLIER_BITS > UINT_BITS) {
                _overflow = bitsUsed + DECAY_MULTIPLIER_BITS - UINT_BITS;
                value >>= _overflow;
                bitsUsed -= _overflow;
            }
            value *= DECAY_MULTIPLIER_16_SECONDS;
            bitsUsed += DECAY_MULTIPLIER_BITS;
            toShift += DECAY_MULTIPLIER_BITS - _overflow;
            elapsedSeconds -= 16;
        }

        if (elapsedSeconds >= 8) {
            uint _overflow = 0;
            if (bitsUsed + DECAY_MULTIPLIER_BITS > UINT_BITS) {
                _overflow = bitsUsed + DECAY_MULTIPLIER_BITS - UINT_BITS;
                value >>= _overflow;
                bitsUsed -= _overflow;
            }
            value *= DECAY_MULTIPLIER_8_SECONDS;
            bitsUsed += DECAY_MULTIPLIER_BITS;
            toShift += DECAY_MULTIPLIER_BITS - _overflow;
            elapsedSeconds -= 8;
        }

        if (elapsedSeconds >= 4) {
            uint _overflow = 0;
            if (bitsUsed + DECAY_MULTIPLIER_BITS > UINT_BITS) {
                _overflow = bitsUsed + DECAY_MULTIPLIER_BITS - UINT_BITS;
                value >>= _overflow;
                bitsUsed -= _overflow;
            }
            value *= DECAY_MULTIPLIER_4_SECONDS;
            bitsUsed += DECAY_MULTIPLIER_BITS;
            toShift += DECAY_MULTIPLIER_BITS - _overflow;
            elapsedSeconds -= 4;
        }

        if (elapsedSeconds >= 2) {
            uint _overflow = 0;
            if (bitsUsed + DECAY_MULTIPLIER_BITS > UINT_BITS) {
                _overflow = bitsUsed + DECAY_MULTIPLIER_BITS - UINT_BITS;
                value >>= _overflow;
                bitsUsed -= _overflow;
            }
            value *= DECAY_MULTIPLIER_2_SECONDS;
            bitsUsed += DECAY_MULTIPLIER_BITS;
            toShift += DECAY_MULTIPLIER_BITS - _overflow;
            elapsedSeconds -= 2;
        }

        if (elapsedSeconds >= 1) {
            uint _overflow = 0;
            if (bitsUsed + DECAY_MULTIPLIER_BITS > UINT_BITS) {
                _overflow = bitsUsed + DECAY_MULTIPLIER_BITS - UINT_BITS;
                value >>= _overflow;
                bitsUsed -= _overflow;
            }
            value *= DECAY_MULTIPLIER_1_SECOND;
            bitsUsed += DECAY_MULTIPLIER_BITS;
            toShift += DECAY_MULTIPLIER_BITS - _overflow;
            elapsedSeconds -= 1;
        }

        if (toShift > 0) {
            value = ((value >> (toShift - 1)) + 1) >> 1;
        }
        return sign ? int(value) : -int(value);
    }
}
