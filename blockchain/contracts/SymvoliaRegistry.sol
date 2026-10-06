// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import "./IZKPassportVerifier.sol";
import "./ISymvoliaRegistry.sol";
import "./Constants.sol";
import "./StringUtils.sol";

contract SymvoliaRegistry is ASymvoliaRegistry {
    error DevProofsNotAllowed();
    error ProofInvalid();
    error AddressAlreadyRegistered(address user, bytes32 existingId);
    error InvalidScope(string expectedDomain, string expectedScope);
    error SenderAddressMismatch(address boundSender, address caller);
    error ChainIdMismatch(uint256 boundChainId, uint256 currentChainId);

    IZKPassportVerifier public zkPassportVerifier;
    string public scope;
    string public domain;
    // uint256 public constant registrationValidityPeriod = 365 days;
    bool public devMode;

    constructor(
        string memory _scope,
        string memory _domain,
        address _verifierAddress,
        bool _devMode
    ) {
        scope = _scope;
        domain = _domain;
        devMode = _devMode;
        zkPassportVerifier = IZKPassportVerifier(_verifierAddress);
    }

    function register(
        ProofVerificationParams calldata _params
    ) external returns (bytes32) {
        if (!devMode && _params.serviceConfig.devMode)
            revert DevProofsNotAllowed();
        // Verify the proof
        (
            bool verified,
            bytes32 uniqueIdentifier,
            IZKPassportHelper helper
        ) = zkPassportVerifier.verify(_params);
        if (!verified) revert ProofInvalid();

        if (userIdFromAddress[msg.sender] != NO_USER) {
            if (userIdFromAddress[msg.sender] != uniqueIdentifier)
                revert AddressAlreadyRegistered(
                    msg.sender,
                    userIdFromAddress[msg.sender]
                );
        }

        // Check the proof was generated using your domain name (scope) and the subscope
        // you specified
        if (
            !helper.verifyScopes(
                _params.proofVerificationData.publicInputs,
                domain,
                scope
            )
        ) revert InvalidScope(domain, scope);

        // Bind the proof to its submitter and chain. Without this, the proof's
        // scoped nullifier is identical regardless of who submits it, so anyone
        // could replay a captured registration proof (the calldata is public)
        // from a fresh address to attach it to the original holder's identity,
        // or bridge it to another chain. The SDK commits `user_address` and
        // `chain` into the proof; require they match this call.
        BoundData memory boundData = helper.getBoundData(
            _params.committedInputs
        );
        if (boundData.senderAddress != msg.sender)
            revert SenderAddressMismatch(boundData.senderAddress, msg.sender);
        if (boundData.chainId != block.chainid)
            revert ChainIdMismatch(boundData.chainId, block.chainid);

        // Get the disclosed data to retrieve the nationality
        DisclosedData memory disclosedData = helper.getDisclosedData(
            _params.committedInputs,
            false
        );

        return _registerHelper(uniqueIdentifier, disclosedData.nationality);
    }
}
