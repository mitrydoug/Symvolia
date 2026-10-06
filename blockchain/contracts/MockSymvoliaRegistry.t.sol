// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

import {MockSymvoliaRegistry} from "./MockSymvoliaRegistry.sol";
import {Registration} from "./ISymvoliaRegistry.sol";
import {
    ProofVerificationParams,
    ProofVerificationData,
    ServiceConfig
} from "./IZKPassportVerifier.sol";

contract MockSymvoliaRegistryTest is Test {
    string constant SCOPE = "my-scope";
    string constant DOMAIN = "myapp.com";

    MockSymvoliaRegistry registry;

    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        // devMode = true so dev/mock proofs are accepted.
        registry = new MockSymvoliaRegistry(SCOPE, true);
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    /// @dev Mirrors MockZKPassportParser's scope commitment.
    function _scopeHash(string memory s) internal pure returns (bytes32) {
        return bytes32(uint256(sha256(abi.encodePacked(s))) >> 8);
    }

    function _buildPublicInputs(
        string memory domain,
        string memory scope,
        bytes32 nullifier
    ) internal pure returns (bytes32[] memory) {
        bytes32[] memory pi = new bytes32[](8);
        pi[3] = _scopeHash(domain);
        pi[4] = _scopeHash(scope);
        pi[6] = nullifier; // length - 2 == scoped nullifier
        return pi;
    }

    /// @dev Builds a committed-inputs blob containing a single DISCLOSE entry
    ///      with the given passport nationality (3 chars).
    function _buildDiscloseCommittedInputs(
        string memory nationality
    ) internal pure returns (bytes memory) {
        bytes memory nat = bytes(nationality);
        require(nat.length == 3, "nationality must be 3 chars");
        bytes memory payload = new bytes(180);
        // Disclosed MRZ bytes start at offset 90; passport nationality index 54.
        for (uint256 i = 0; i < 3; i++) {
            payload[90 + 54 + i] = nat[i];
        }
        // proofType (1 byte) + length (2 byte BE) + payload.
        return abi.encodePacked(uint8(0), uint16(180), payload);
    }

    /// @dev Builds a committed-inputs blob with only an AGE entry (no DISCLOSE).
    function _buildAgeOnlyCommittedInputs()
        internal
        pure
        returns (bytes memory)
    {
        bytes memory payload = new bytes(11);
        return abi.encodePacked(uint8(1), uint16(11), payload);
    }

    /// @dev Encodes a value as its minimal big-endian byte string (no leading
    ///      zero bytes), matching how the ZKPassport SDK commits the chain id.
    function _minimalBE(uint256 x) internal pure returns (bytes memory) {
        if (x == 0) return abi.encodePacked(uint8(0));
        uint256 nbytes = 0;
        uint256 tmp = x;
        while (tmp > 0) {
            nbytes++;
            tmp >>= 8;
        }
        bytes memory out = new bytes(nbytes);
        for (uint256 i = 0; i < nbytes; i++) {
            out[nbytes - 1 - i] = bytes1(uint8(x >> (8 * i)));
        }
        return out;
    }

    /// @dev Builds a BIND committed-inputs entry (proofType 8, 509-byte
    ///      payload) binding the proof to `sender` on chain `chainId`, matching
    ///      the EVM bound-data tag-length-value layout the verifier parses:
    ///      USER_ADDRESS (tag 1, len 20) then CHAIN_ID (tag 2, minimal BE),
    ///      with the remainder of the 509 bytes left as zero padding.
    function _buildBind(
        address sender,
        uint256 chainId
    ) internal pure returns (bytes memory) {
        bytes memory data = new bytes(509);
        // USER_ADDRESS: [0x01][0x00][0x14][20 address bytes].
        data[0] = bytes1(uint8(1));
        data[1] = 0x00;
        data[2] = bytes1(uint8(20));
        bytes20 a = bytes20(sender);
        for (uint256 i = 0; i < 20; i++) {
            data[3 + i] = a[i];
        }
        // CHAIN_ID: [0x02][0x00][len][chainId minimal big-endian bytes].
        bytes memory cid = _minimalBE(chainId);
        uint256 p = 23;
        data[p] = bytes1(uint8(2));
        data[p + 1] = 0x00;
        data[p + 2] = bytes1(uint8(cid.length));
        for (uint256 i = 0; i < cid.length; i++) {
            data[p + 3 + i] = cid[i];
        }
        return abi.encodePacked(uint8(8), uint16(509), data);
    }

    /// @dev Builds params WITHOUT a BIND entry. Used to exercise the mock
    ///      registry's mandatory bound-data enforcement.
    function _buildParamsUnbound(
        string memory domain,
        string memory scope,
        bytes32 nullifier,
        bytes memory committedInputs,
        bool devMode
    ) internal pure returns (ProofVerificationParams memory) {
        return
            ProofVerificationParams({
                version: bytes32(0),
                proofVerificationData: ProofVerificationData({
                    vkeyHash: bytes32(0),
                    proof: "",
                    publicInputs: _buildPublicInputs(domain, scope, nullifier)
                }),
                committedInputs: committedInputs,
                serviceConfig: ServiceConfig({
                    validityPeriodInSeconds: 0,
                    domain: domain,
                    scope: scope,
                    devMode: devMode
                })
            });
    }

    /// @dev Builds params bound to `boundAddress` on an explicit chain id by
    ///      appending a BIND entry to the committed inputs.
    function _buildParamsBoundTo(
        string memory domain,
        string memory scope,
        bytes32 nullifier,
        bytes memory committedInputs,
        bool devMode,
        address boundAddress,
        uint256 boundChainId
    ) internal pure returns (ProofVerificationParams memory) {
        return
            _buildParamsUnbound(
                domain,
                scope,
                nullifier,
                abi.encodePacked(
                    committedInputs,
                    _buildBind(boundAddress, boundChainId)
                ),
                devMode
            );
    }

    /// @dev Builds params bound to `boundAddress` on the current chain, which
    ///      is the common case for the happy-path tests.
    function _buildParams(
        string memory domain,
        string memory scope,
        bytes32 nullifier,
        bytes memory committedInputs,
        bool devMode,
        address boundAddress
    ) internal view returns (ProofVerificationParams memory) {
        return
            _buildParamsBoundTo(
                domain,
                scope,
                nullifier,
                committedInputs,
                devMode,
                boundAddress,
                block.chainid
            );
    }

    // ------------------------------------------------------------------
    // Tests
    // ------------------------------------------------------------------

    function test_register_happyPath() external {
        bytes32 nullifier = keccak256("alice-id");
        ProofVerificationParams memory params = _buildParams(
            DOMAIN,
            SCOPE,
            nullifier,
            _buildDiscloseCommittedInputs("USA"),
            false,
            alice
        );

        vm.prank(alice);
        bytes32 userId = registry.register(params);

        assertEq(userId, nullifier, "returns scoped nullifier as user id");
        assertTrue(registry.isRegistered(alice), "alice is registered");
        assertEq(
            registry.getUserIdentifier(alice),
            nullifier,
            "user identifier matches nullifier"
        );

        Registration memory reg = registry.getUserRegistration(alice);
        assertEq(reg.nationality, "USA", "nationality recovered from proof");
        assertEq(reg.registeredAddresses.length, 1, "one registered address");
        assertEq(reg.registeredAddresses[0], alice, "address recorded");
    }

    function test_register_withoutDisclosure_leavesNationalityEmpty() external {
        bytes32 nullifier = keccak256("no-nat");
        ProofVerificationParams memory params = _buildParams(
            DOMAIN,
            SCOPE,
            nullifier,
            _buildAgeOnlyCommittedInputs(),
            false,
            alice
        );

        vm.prank(alice);
        registry.register(params);

        Registration memory reg = registry.getUserRegistration(alice);
        assertEq(bytes(reg.nationality).length, 0, "nationality is empty");
    }

    function test_register_bindOnly_leavesNationalityEmpty() external {
        // Committed inputs contain only the mandatory BIND entry (no DISCLOSE),
        // so registration succeeds with an empty nationality.
        bytes32 nullifier = keccak256("empty-ci");
        ProofVerificationParams memory params = _buildParams(
            DOMAIN,
            SCOPE,
            nullifier,
            "",
            false,
            alice
        );

        vm.prank(alice);
        registry.register(params);

        Registration memory reg = registry.getUserRegistration(alice);
        assertEq(bytes(reg.nationality).length, 0, "nationality is empty");
    }

    function test_register_missingBoundData_reverts() external {
        // A proof generated without a `.bind(...)` call has no BIND entry and
        // must be rejected, mirroring on-chain binding enforcement.
        bytes32 nullifier = keccak256("no-bind");
        ProofVerificationParams memory params = _buildParamsUnbound(
            DOMAIN,
            SCOPE,
            nullifier,
            _buildDiscloseCommittedInputs("USA"),
            false
        );

        vm.prank(alice);
        vm.expectRevert(bytes("MockParser: bind data not found"));
        registry.register(params);
    }

    function test_register_boundToDifferentAddress_reverts() external {
        // Proof bound to bob but submitted by alice: replay/hijack is rejected.
        bytes32 nullifier = keccak256("wrong-addr");
        ProofVerificationParams memory params = _buildParams(
            DOMAIN,
            SCOPE,
            nullifier,
            _buildDiscloseCommittedInputs("USA"),
            false,
            bob
        );

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                MockSymvoliaRegistry.SenderAddressMismatch.selector,
                bob,
                alice
            )
        );
        registry.register(params);
    }

    function test_register_boundToDifferentChain_reverts() external {
        // Proof bound to a different chain id is rejected (no cross-chain
        // replay).
        bytes32 nullifier = keccak256("wrong-chain");
        uint256 wrongChainId = block.chainid + 1;
        ProofVerificationParams memory params = _buildParamsBoundTo(
            DOMAIN,
            SCOPE,
            nullifier,
            _buildDiscloseCommittedInputs("USA"),
            false,
            alice,
            wrongChainId
        );

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                MockSymvoliaRegistry.ChainIdMismatch.selector,
                wrongChainId,
                block.chainid
            )
        );
        registry.register(params);
    }

    function test_register_invalidScope_reverts() external {
        bytes32 nullifier = keccak256("bad-scope");
        ProofVerificationParams memory params = _buildParams(
            DOMAIN,
            "wrong-scope",
            nullifier,
            _buildDiscloseCommittedInputs("USA"),
            false,
            alice
        );

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                MockSymvoliaRegistry.InvalidScope.selector,
                SCOPE
            )
        );
        registry.register(params);
    }

    function test_register_ignoresServiceScopeDomain() external {
        // The service scope (domain) committed by the ZKPassport SDK is not
        // enforced, so a proof generated from a different host still registers
        // as long as the subscope matches.
        bytes32 nullifier = keccak256("other-domain");
        ProofVerificationParams memory params = _buildParams(
            "wrong.com",
            SCOPE,
            nullifier,
            _buildDiscloseCommittedInputs("USA"),
            false,
            alice
        );

        vm.prank(alice);
        bytes32 userId = registry.register(params);

        assertEq(userId, nullifier, "registers regardless of service scope");
        assertTrue(registry.isRegistered(alice), "alice is registered");
    }

    function test_register_devProofRejectedWhenNotDevMode() external {
        MockSymvoliaRegistry prod = new MockSymvoliaRegistry(SCOPE, false);
        bytes32 nullifier = keccak256("dev-proof");
        ProofVerificationParams memory params = _buildParams(
            DOMAIN,
            SCOPE,
            nullifier,
            _buildDiscloseCommittedInputs("USA"),
            true, // serviceConfig.devMode
            alice
        );

        vm.prank(alice);
        vm.expectRevert(MockSymvoliaRegistry.DevProofsNotAllowed.selector);
        prod.register(params);
    }

    function test_register_sameAddressDifferentIdentity_reverts() external {
        bytes32 firstId = keccak256("id-1");
        bytes32 secondId = keccak256("id-2");

        ProofVerificationParams memory firstParams = _buildParams(
            DOMAIN,
            SCOPE,
            firstId,
            _buildDiscloseCommittedInputs("USA"),
            false,
            alice
        );
        ProofVerificationParams memory secondParams = _buildParams(
            DOMAIN,
            SCOPE,
            secondId,
            _buildDiscloseCommittedInputs("USA"),
            false,
            alice
        );

        vm.prank(alice);
        registry.register(firstParams);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                MockSymvoliaRegistry.AddressAlreadyRegistered.selector,
                alice,
                firstId
            )
        );
        registry.register(secondParams);
    }

    function test_register_sharedIdentityAcrossAddresses() external {
        bytes32 nullifier = keccak256("shared-id");

        ProofVerificationParams memory aliceParams = _buildParams(
            DOMAIN,
            SCOPE,
            nullifier,
            _buildDiscloseCommittedInputs("USA"),
            false,
            alice
        );
        ProofVerificationParams memory bobParams = _buildParams(
            DOMAIN,
            SCOPE,
            nullifier,
            _buildDiscloseCommittedInputs("USA"),
            false,
            bob
        );

        vm.prank(alice);
        registry.register(aliceParams);

        vm.prank(bob);
        registry.register(bobParams);

        assertEq(
            registry.getUserIdentifier(alice),
            registry.getUserIdentifier(bob),
            "both addresses share the same identity"
        );
        Registration memory reg = registry.getUserRegistration(bob);
        assertEq(reg.registeredAddresses.length, 2, "two addresses linked");
    }

    function test_register_nationalityMismatch_reverts() external {
        bytes32 nullifier = keccak256("mismatch-id");

        ProofVerificationParams memory usaParams = _buildParams(
            DOMAIN,
            SCOPE,
            nullifier,
            _buildDiscloseCommittedInputs("USA"),
            false,
            alice
        );
        ProofVerificationParams memory canParams = _buildParams(
            DOMAIN,
            SCOPE,
            nullifier,
            _buildDiscloseCommittedInputs("CAN"),
            false,
            bob
        );

        vm.prank(alice);
        registry.register(usaParams);

        vm.prank(bob);
        vm.expectRevert();
        registry.register(canParams);
    }
}
