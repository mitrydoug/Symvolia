// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import "./Constants.sol";
import "./ISymvoliaRegistry.sol";
import "./StringUtils.sol";

/**
 * @title DevSymvoliaRegistry
 * @notice Development registry that derives a deterministic user id from the
 *         caller's address, bypassing ZKPassport entirely. Used for fast local
 *         iteration where a Hardhat signer can self-register instantly.
 *
 * @dev This is the former `MockSymvoliaRegistry`. It performs no humanity
 *      verification and must never be deployed to production. For a mock that
 *      exercises the real ZKPassport registration flow without an on-chain
 *      verifier, see {MockSymvoliaRegistry}.
 */
contract DevSymvoliaRegistry is ASymvoliaRegistry {
    function register(string memory nationality) external returns (bytes32) {
        bytes32 userId = keccak256(abi.encode(msg.sender));
        return _registerHelper(userId, nationality);
    }
}
