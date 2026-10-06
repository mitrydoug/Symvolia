// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import "./Constants.sol";
import "./IZKPassportVerifier.sol";
import "./ISymvoliaRegistry.sol";
import "./MockZKPassportParser.sol";

/**
 * @title MockSymvoliaRegistry
 * @notice Registry that follows the same registration flow as
 *         {SymvoliaRegistry} but does NOT call an on-chain ZKPassport verifier.
 *         Instead it disassembles the supplied proof parameters to recover the
 *         unique identifier (scoped nullifier) and the disclosed nationality.
 *
 * @dev Intended for networks where ZKPassport has not deployed its verifier
 *      contract (e.g. Base Sepolia used by test.symvolia.org). The full
 *      client-side ZKPassport flow (install app, add passport, scan and
 *      generate a proof) still runs; only the on-chain SNARK verification is
 *      skipped. Because it provides no cryptographic guarantees it must never
 *      be deployed to production — use {SymvoliaRegistry} there.
 *
 *      All non-cryptographic checks performed by {SymvoliaRegistry} are
 *      retained EXCEPT the service-scope (domain) check: dev-proof gating,
 *      address/unique-identifier de-duplication, subscope matching and
 *      nationality consistency. The domain is intentionally not enforced
 *      because the ZKPassport SDK commits window.location.hostname as the
 *      service scope, which differs between hosts (e.g. test.symvolia.org vs
 *      127.0.0.1) and would otherwise reject valid proofs.
 */
contract MockSymvoliaRegistry is ASymvoliaRegistry {
    error DevProofsNotAllowed();
    error AddressAlreadyRegistered(address user, bytes32 existingId);
    error InvalidScope(string expectedScope);
    error SenderAddressMismatch(address boundSender, address caller);
    error ChainIdMismatch(uint256 boundChainId, uint256 currentChainId);

    string public scope;
    bool public devMode;

    constructor(string memory _scope, bool _devMode) {
        scope = _scope;
        devMode = _devMode;
    }

    function register(
        ProofVerificationParams calldata _params
    ) external returns (bytes32) {
        if (!devMode && _params.serviceConfig.devMode)
            revert DevProofsNotAllowed();

        // Recover the unique identifier (scoped nullifier) from the public
        // inputs instead of verifying the proof on-chain.
        bytes32 uniqueIdentifier = MockZKPassportParser.getScopedNullifier(
            _params.proofVerificationData.publicInputs
        );

        if (userIdFromAddress[msg.sender] != NO_USER) {
            if (userIdFromAddress[msg.sender] != uniqueIdentifier)
                revert AddressAlreadyRegistered(
                    msg.sender,
                    userIdFromAddress[msg.sender]
                );
        }

        // Check the proof was committed to our subscope. The service scope
        // (domain) is intentionally NOT enforced: the ZKPassport SDK commits
        // window.location.hostname as the scope, which differs between hosts
        // (e.g. test.symvolia.org vs 127.0.0.1), so enforcing it would reject
        // otherwise-valid proofs depending on where the frontend was served.
        if (
            !MockZKPassportParser.verifySubscope(
                _params.proofVerificationData.publicInputs,
                scope
            )
        ) revert InvalidScope(scope);

        // Bind the proof to its submitter and chain, mirroring
        // {SymvoliaRegistry}. Without this the scoped nullifier is identical
        // regardless of who submits it, so anyone could replay a captured
        // registration proof (the calldata is public) from a fresh address to
        // hijack the original holder's identity, or bridge it to another chain.
        // The SDK commits `user_address` and `chain` into the proof; require
        // they match this call. Enforcing it here keeps the mock (testnet)
        // behaviour as close to mainnet as possible.
        BoundData memory boundData = MockZKPassportParser.getBoundData(
            _params.committedInputs
        );
        if (boundData.senderAddress != msg.sender)
            revert SenderAddressMismatch(boundData.senderAddress, msg.sender);
        if (boundData.chainId != block.chainid)
            revert ChainIdMismatch(boundData.chainId, block.chainid);

        // Recover the disclosed nationality, if any.
        string memory nationality = MockZKPassportParser
            .getDisclosedNationality(_params.committedInputs, false);

        return _registerHelper(uniqueIdentifier, nationality);
    }
}
