// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import "./IZKPassportVerifier.sol";
import "./StringUtils.sol";

/**
 * @title MockZKPassportParser
 * @notice Parses ZKPassport proof parameters WITHOUT performing SNARK
 *         verification. It re-implements the calldata-parsing subset of the
 *         official ZKPassport verifier helpers (scoped nullifier extraction,
 *         scope checking and disclosed-nationality extraction).
 *
 * @dev This library exists only so that a mock registry can follow the same
 *      registration flow as {SymvoliaRegistry} on networks where the real
 *      ZKPassport verifier contract has not been deployed (e.g. Base Sepolia).
 *      It provides NO cryptographic guarantees — it merely disassembles the
 *      public inputs and committed inputs supplied by the caller. Never use it
 *      in production.
 *
 *      Byte layouts mirror the ZKPassport registry-contracts package:
 *      - Public inputs trailing layout: [len-3] nullifier_type,
 *        [len-2] scoped_nullifier, [len-1] oprf_pk_hash.
 *      - Public inputs scope layout: [3] service_scope, [4] service_subscope,
 *        each committed as `sha256(abi.encodePacked(value)) >> 8`.
 *      - Committed inputs framing: repeated entries of
 *        `[1 byte proofType][2 byte big-endian length][length bytes payload]`.
 *      - A DISCLOSE entry (proofType 0) has a 180-byte payload: 90 mask bytes
 *        followed by 90 disclosed MRZ bytes. Nationality is a 3-byte field at
 *        MRZ index 54 (passport) or 45 (ID card).
 */
library MockZKPassportParser {
    /// @dev ProofType.DISCLOSE from the ZKPassport committed-inputs framing.
    uint8 internal constant PROOF_TYPE_DISCLOSE = 0;
    /// @dev Total DISCLOSE payload length (90 mask + 90 disclosed MRZ bytes).
    uint256 internal constant DISCLOSE_BYTES_LEN = 180;
    /// @dev Offset of the disclosed MRZ bytes within a DISCLOSE payload.
    uint256 internal constant DISCLOSE_MRZ_OFFSET = 90;
    /// @dev Index of the 3-byte nationality field within passport MRZ bytes.
    uint256 internal constant PASSPORT_NATIONALITY_INDEX = 54;
    /// @dev Index of the 3-byte nationality field within ID-card MRZ bytes.
    uint256 internal constant ID_CARD_NATIONALITY_INDEX = 45;
    /// @dev Length of the nationality MRZ field.
    uint256 internal constant NATIONALITY_LEN = 3;
    /// @dev Public-input index of the committed service scope.
    uint256 internal constant SCOPE_INDEX = 3;
    /// @dev Public-input index of the committed service subscope.
    uint256 internal constant SUBSCOPE_INDEX = 4;
    /// @dev ProofType.BIND from the ZKPassport committed-inputs framing.
    uint8 internal constant PROOF_TYPE_BIND = 8;
    /// @dev Total BIND (EVM) payload length: the bound-data byte array.
    uint256 internal constant BOUND_DATA_LEN = 509;
    /// @dev BoundDataIdentifier tag for the committed user address.
    uint8 internal constant BOUND_ID_USER_ADDRESS = 1;
    /// @dev BoundDataIdentifier tag for the committed chain id.
    uint8 internal constant BOUND_ID_CHAIN_ID = 2;
    /// @dev BoundDataIdentifier tag for committed custom data.
    uint8 internal constant BOUND_ID_CUSTOM_DATA = 3;
    /// @dev Length of a committed user address (bytes).
    uint256 internal constant BOUND_ADDRESS_LEN = 20;

    /**
     * @notice Extracts the scoped nullifier (unique identifier) from the
     *         public inputs. This is the second-to-last public input.
     * @param publicInputs The proof public inputs.
     * @return The scoped nullifier used as the registry unique identifier.
     */
    function getScopedNullifier(
        bytes32[] calldata publicInputs
    ) internal pure returns (bytes32) {
        require(publicInputs.length >= 2, "MockParser: publicInputs too short");
        return publicInputs[publicInputs.length - 2];
    }

    /**
     * @notice Verifies that the proof was committed to the given scope and
     *         subscope, matching the official verifier's scope check.
     * @param publicInputs The proof public inputs.
     * @param scope The service scope (the registry domain).
     * @param subscope The service subscope (the registry scope).
     * @return True if both the scope and subscope commitments match.
     */
    function verifyScopes(
        bytes32[] calldata publicInputs,
        string memory scope,
        string memory subscope
    ) internal pure returns (bool) {
        require(
            publicInputs.length > SUBSCOPE_INDEX,
            "MockParser: publicInputs too short"
        );
        bytes32 scopeHash = StringUtils.isEmpty(scope)
            ? bytes32(0)
            : bytes32(uint256(sha256(abi.encodePacked(scope))) >> 8);
        bytes32 subscopeHash = StringUtils.isEmpty(subscope)
            ? bytes32(0)
            : bytes32(uint256(sha256(abi.encodePacked(subscope))) >> 8);
        return
            publicInputs[SCOPE_INDEX] == scopeHash &&
            publicInputs[SUBSCOPE_INDEX] == subscopeHash;
    }

    /**
     * @notice Verifies that the proof was committed to the given subscope,
     *         ignoring the service scope (domain).
     * @dev The ZKPassport SDK derives the service scope from the verifying
     *      party's domain (window.location.hostname), which differs between
     *      hosts (e.g. test.symvolia.org vs 127.0.0.1). Checking only the
     *      developer-chosen subscope lets a single deployment accept proofs
     *      generated from any host while still enforcing the app scope.
     * @param publicInputs The proof public inputs.
     * @param subscope The service subscope (the registry scope).
     * @return True if the subscope commitment matches.
     */
    function verifySubscope(
        bytes32[] calldata publicInputs,
        string memory subscope
    ) internal pure returns (bool) {
        require(
            publicInputs.length > SUBSCOPE_INDEX,
            "MockParser: publicInputs too short"
        );
        bytes32 subscopeHash = StringUtils.isEmpty(subscope)
            ? bytes32(0)
            : bytes32(uint256(sha256(abi.encodePacked(subscope))) >> 8);
        return publicInputs[SUBSCOPE_INDEX] == subscopeHash;
    }

    /**
     * @notice Extracts the disclosed nationality from the committed inputs.
     * @dev Unlike the official helper, this is lenient: if no DISCLOSE entry is
     *      present it returns an empty string rather than reverting, matching
     *      the registry's "disclosed nationality, if any" semantics.
     * @param committedInputs The proof committed inputs.
     * @param isIDCard Whether the document is an ID card (vs. a passport).
     * @return The 3-letter nationality code, or "" if none was disclosed.
     */
    function getDisclosedNationality(
        bytes calldata committedInputs,
        bool isIDCard
    ) internal pure returns (string memory) {
        uint256 offset = 0;
        uint256 total = committedInputs.length;
        uint256 natIndex = isIDCard
            ? ID_CARD_NATIONALITY_INDEX
            : PASSPORT_NATIONALITY_INDEX;

        while (offset + 3 <= total) {
            uint8 proofType = uint8(committedInputs[offset]);
            uint256 payloadLen = (uint256(uint8(committedInputs[offset + 1])) <<
                8) | uint256(uint8(committedInputs[offset + 2]));
            uint256 payloadStart = offset + 3;
            require(
                payloadStart + payloadLen <= total,
                "MockParser: truncated committedInputs"
            );

            if (
                proofType == PROOF_TYPE_DISCLOSE &&
                payloadLen == DISCLOSE_BYTES_LEN
            ) {
                uint256 natStart = payloadStart +
                    DISCLOSE_MRZ_OFFSET +
                    natIndex;
                return
                    string(
                        committedInputs[natStart:natStart + NATIONALITY_LEN]
                    );
            }

            offset = payloadStart + payloadLen;
        }

        return "";
    }

    /**
     * @notice Extracts the data bound to the proof (submitter address, chain
     *         id and custom data) from the committed inputs, mirroring the
     *         official verifier helper's `getBoundData`.
     * @dev Locates the single BIND entry (proofType 8, 509-byte payload) in the
     *      committed-inputs framing and parses its tag-length-value payload.
     *      Reverts if no BIND entry is present, so a proof generated without a
     *      `.bind(...)` call cannot register — matching the on-chain binding
     *      enforcement performed by {SymvoliaRegistry} in production.
     * @param committedInputs The proof committed inputs.
     * @return boundData The decoded bound data (sender, chain id, custom data).
     */
    function getBoundData(
        bytes calldata committedInputs
    ) internal pure returns (BoundData memory boundData) {
        uint256 offset = 0;
        uint256 total = committedInputs.length;

        while (offset + 3 <= total) {
            uint8 proofType = uint8(committedInputs[offset]);
            uint256 payloadLen = (uint256(uint8(committedInputs[offset + 1])) <<
                8) | uint256(uint8(committedInputs[offset + 2]));
            uint256 payloadStart = offset + 3;
            require(
                payloadStart + payloadLen <= total,
                "MockParser: truncated committedInputs"
            );

            if (proofType == PROOF_TYPE_BIND && payloadLen == BOUND_DATA_LEN) {
                return
                    _parseBoundData(
                        committedInputs[
                            payloadStart:payloadStart + BOUND_DATA_LEN
                        ]
                    );
            }

            offset = payloadStart + payloadLen;
        }

        revert("MockParser: bind data not found");
    }

    /**
     * @notice Parses a 509-byte bound-data payload into its fields.
     * @dev Walks the tag-length-value entries (USER_ADDRESS, CHAIN_ID,
     *      CUSTOM_DATA). An unknown tag marks the start of zero padding, which
     *      must be all zeros. The chain id is stored as a minimal big-endian
     *      byte string and left-aligned back into a uint256.
     * @param data The 509-byte bound-data payload.
     * @return boundData The decoded bound data.
     */
    function _parseBoundData(
        bytes calldata data
    ) private pure returns (BoundData memory boundData) {
        uint256 p = 0;
        while (p < BOUND_DATA_LEN) {
            uint8 tag = uint8(data[p]);
            if (tag == BOUND_ID_USER_ADDRESS) {
                uint256 len = (uint256(uint8(data[p + 1])) << 8) |
                    uint256(uint8(data[p + 2]));
                require(
                    len == BOUND_ADDRESS_LEN,
                    "MockParser: bad bound address length"
                );
                boundData.senderAddress = address(
                    bytes20(data[p + 3:p + 3 + len])
                );
                p += 3 + len;
            } else if (tag == BOUND_ID_CHAIN_ID) {
                uint256 len = (uint256(uint8(data[p + 1])) << 8) |
                    uint256(uint8(data[p + 2]));
                require(len <= 32, "MockParser: bound chain id too long");
                boundData.chainId =
                    uint256(bytes32(data[p + 3:p + 3 + len])) >>
                    (256 - (len * 8));
                p += 3 + len;
            } else if (tag == BOUND_ID_CUSTOM_DATA) {
                uint256 len = (uint256(uint8(data[p + 1])) << 8) |
                    uint256(uint8(data[p + 2]));
                boundData.customData = string(data[p + 3:p + 3 + len]);
                p += 3 + len;
            } else {
                // An unknown tag marks the start of the zero padding that fills
                // the remainder of the fixed-length bound-data array.
                for (uint256 i = p; i < BOUND_DATA_LEN; i++) {
                    require(data[i] == 0, "MockParser: invalid bind padding");
                }
                break;
            }
        }
    }
}
