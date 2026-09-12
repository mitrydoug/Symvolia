// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {console} from "forge-std/console.sol";

import {Forum} from "./Forum.sol";
import {DevSymvoliaRegistry} from "./DevSymvoliaRegistry.sol";
import {ASymvoliaRegistry} from "./ISymvoliaRegistry.sol";

// Test harness to expose internal methods for testing
contract ForumHarness is Forum {
    constructor(
        ASymvoliaRegistry _symvoliaRegistry,
        string memory _nationality,
        Forum.ForumConfig memory _config
    ) Forum(_symvoliaRegistry, _nationality, _config) {}

    function exposed_costOfUserSupport(
        int _userSupport
    ) external view returns (uint) {
        return _costOfUserSupport(_userSupport);
    }

    function exposed_userSupportedStatements(
        bytes32 userId
    ) external view returns (uint[] memory) {
        return _userSupportedStatements[userId];
    }
}

contract ForumTest is Test {
    uint constant MOCK_TEST_TIMESTAMP = 1767572100;
    uint constant CREDIT_ALLOWANCE_INTERVAL_SECONDS = 60;
    uint constant HALF_LIFE = 604800; // 1 week in seconds
    uint constant ONE_PERCENT_DECAY_SECONDS = 8770;
    DevSymvoliaRegistry mockRegistry;
    ForumHarness forum;

    function setUp() public {
        vm.warp(MOCK_TEST_TIMESTAMP);

        mockRegistry = new DevSymvoliaRegistry();
        forum = new ForumHarness(
            mockRegistry,
            "",
            Forum.ForumConfig({
                maxRankedStatements: 3,
                creditAllowanceIntervalSeconds: CREDIT_ALLOWANCE_INTERVAL_SECONDS,
                engagementWindowSeconds: 60,
                maxStatementLength: 120,
                userCreditAllowancePerInterval: 25,
                userStartingCredits: 1000,
                minStatementSupportToRank: 2,
                minAdjustmentIntervalSeconds: 12,
                creditMultiplier: 1,
                refundPenaltyBps: 0,
                decaySpeedupFactor: 1,
                statementBurstCapacity: 1000,
                statementRefillIntervalSeconds: 60
            })
        );
    }

    /// @dev Advance block.timestamp by minAdjustmentIntervalSeconds to avoid
    ///      DuplicateAdjustment reverts when adjusting the same statement.
    function _nextBlock() internal {
        vm.warp(block.timestamp + forum.minAdjustmentIntervalSeconds());
    }

    modifier registeredMember() {
        mockRegistry.register("");
        _;
    }

    function _getStatementById(
        uint _statementId
    ) internal view returns (Forum.Statement memory) {
        uint[] memory statementIds = _oneId(_statementId);
        Forum.Statement[] memory statements = forum.getStatementsById(
            statementIds
        );
        return statements[0];
    }

    function _oneId(uint _statementId) internal pure returns (uint[] memory) {
        uint[] memory statementIds = new uint[](1);
        statementIds[0] = _statementId;
        return statementIds;
    }

    function _deltaSupportAdjustment(
        uint _statementId,
        int _value
    ) internal pure returns (Forum.SupportAdjustment memory) {
        return
            Forum.SupportAdjustment({
                statementId: _statementId,
                value: _value,
                adjustmentType: Forum.SupportAdjustmentType.Delta
            });
    }

    function _setToSupportAdjustment(
        uint _statementId,
        int _value
    ) internal pure returns (Forum.SupportAdjustment memory) {
        return
            Forum.SupportAdjustment({
                statementId: _statementId,
                value: _value,
                adjustmentType: Forum.SupportAdjustmentType.SetTo
            });
    }

    function _addStatementSupport(uint _statementId, int _value) internal {
        Forum.SupportAdjustment[]
            memory adjustments = new Forum.SupportAdjustment[](1);
        adjustments[0] = _deltaSupportAdjustment(_statementId, _value);
        forum.adjustSupport(adjustments);
    }

    function _setStatementSupport(uint _statementId, int _value) internal {
        Forum.SupportAdjustment[]
            memory adjustments = new Forum.SupportAdjustment[](1);
        adjustments[0] = _setToSupportAdjustment(_statementId, _value);
        forum.adjustSupport(adjustments);
    }

    function testIsMemberNotRegistered() external view {
        assertFalse(
            forum.isMember(),
            "deployer should not be member before registration"
        );
    }

    function testRegistration() external registeredMember {
        assertTrue(
            forum.isMember(),
            "deployer should be member after registration"
        );
    }

    function testInitialUserBalance() external registeredMember {
        uint balance = forum.getUserBalance();
        assertEq(
            balance,
            1000,
            "Initial user balance should match userStartingCredits"
        );
    }

    function testGetUserLastUpdatedTracksActions() external registeredMember {
        // No credit-affecting action yet: raw stored lastUpdated is 0.
        assertEq(
            forum.getUserLastUpdated(),
            0,
            "lastUpdated should be 0 before any action"
        );

        // Adding a statement with initial support bumps lastUpdated.
        forum.addStatement("Hello, world!", 1);
        uint afterAdd = forum.getUserLastUpdated();
        assertEq(
            afterAdd,
            block.timestamp,
            "lastUpdated should equal block.timestamp after addStatement"
        );
        assertGt(afterAdd, 0, "lastUpdated should be non-zero after an action");

        // Adjusting support on a later block advances lastUpdated again.
        _nextBlock();
        _addStatementSupport(0, 1);
        assertEq(
            forum.getUserLastUpdated(),
            block.timestamp,
            "lastUpdated should equal block.timestamp after adjustSupport"
        );
        assertGt(
            forum.getUserLastUpdated(),
            afterAdd,
            "lastUpdated should strictly increase across actions"
        );
    }

    function testGetUserLastUpdatedBumpsOnZeroSupportStatement()
        external
        registeredMember
    {
        assertEq(
            forum.getUserLastUpdated(),
            0,
            "lastUpdated should be 0 before any action"
        );

        // Adding a statement with zero initial support must still advance
        // lastUpdated so clients can detect the on-chain change.
        forum.addStatement("No initial support", 0);
        assertEq(
            forum.getUserLastUpdated(),
            block.timestamp,
            "lastUpdated should advance after a zero-support statement add"
        );
    }

    function testUserBalanceAllowance() external registeredMember {
        uint initialBalance = forum.getUserBalance();
        vm.warp(
            vm.getBlockTimestamp() + forum.creditAllowanceIntervalSeconds()
        );
        uint newBalance = forum.getUserBalance();
        assertEq(
            newBalance,
            initialBalance + 25,
            "User balance should increase by 25 credits after one interval"
        );
        vm.warp(
            vm.getBlockTimestamp() + 5 * forum.creditAllowanceIntervalSeconds()
        );
        newBalance = forum.getUserBalance();
        assertEq(
            newBalance,
            initialBalance + 150,
            "User balance should increase by 150 credits after 6 intervals"
        );
    }

    function testAddStatement() external registeredMember {
        forum.addStatement("Hello, world!", 0);
        assertEq(
            forum.statementCount(),
            1,
            "Forum should have 1 statement after addition"
        );

        Forum.Statement memory _statement = _getStatementById(0);
        assertEq(
            _statement.text,
            "Hello, world!",
            "Statement content should match"
        );
        assertEq(_statement.support, 0, "Initial support should be 0");
        assertEq(_statement.rank, -1, "Initial rank should be -1");
    }

    function testAddStatementSupport() external registeredMember {
        forum.addStatement("Hello, world!", 0);
        _addStatementSupport(0, 1);

        Forum.Statement memory statement = _getStatementById(0);
        assertEq(statement.support, 1, "Support should be incremented to 1");
    }

    function testSetToSupportAdjustmentSetsExactSupport()
        external
        registeredMember
    {
        forum.addStatement("SetTo statement", 0);
        _addStatementSupport(0, 5); // Cost: 15

        _nextBlock();
        _setStatementSupport(0, 2); // New cost: 3, refund: 12

        Forum.Statement memory statement = _getStatementById(0);
        assertEq(statement.support, 2, "Support should be set to 2");
        assertEq(
            forum.getUserBalance(),
            997,
            "Balance should reflect the target support cost"
        );
    }

    function testSetToZeroClearsSupportInBatch() external registeredMember {
        forum.addStatement("Statement A", 0);
        forum.addStatement("Statement B", 0);
        _addStatementSupport(0, 5); // Cost: 15
        _addStatementSupport(1, 1); // Cost: 1

        _nextBlock();
        Forum.SupportAdjustment[]
            memory adjustments = new Forum.SupportAdjustment[](2);
        adjustments[0] = _setToSupportAdjustment(0, 0); // Refund: 15
        adjustments[1] = _deltaSupportAdjustment(1, 2); // Additional cost: 5
        forum.adjustSupport(adjustments);

        assertEq(_getStatementById(0).support, 0, "Statement A is cleared");
        assertEq(_getStatementById(1).support, 3, "Statement B is updated");
        assertEq(
            forum.getUserBalance(),
            994,
            "Net batch refund should be applied across SetTo and Delta"
        );

        Forum.StatementSupport[] memory userSupport = forum
            .getUserStatementSupport();
        assertEq(userSupport.length, 1, "Cleared support should be hidden");
        assertEq(userSupport[0].statementId, 1, "Statement B should remain");
    }

    function testSetToZeroClearsFractionalSupportParts()
        external
        registeredMember
    {
        ForumHarness fractionalForum = new ForumHarness(
            mockRegistry,
            "",
            Forum.ForumConfig({
                maxRankedStatements: 3,
                creditAllowanceIntervalSeconds: CREDIT_ALLOWANCE_INTERVAL_SECONDS,
                engagementWindowSeconds: 60,
                maxStatementLength: 120,
                userCreditAllowancePerInterval: 25 * 100,
                userStartingCredits: 1000 * 100,
                minStatementSupportToRank: 2 * 100,
                minAdjustmentIntervalSeconds: 12,
                creditMultiplier: 100,
                refundPenaltyBps: 0,
                decaySpeedupFactor: 1,
                statementBurstCapacity: 1000,
                statementRefillIntervalSeconds: 60
            })
        );

        fractionalForum.addStatement("Fractional support", 1);
        vm.warp(
            block.timestamp + fractionalForum.minAdjustmentIntervalSeconds()
        );

        Forum.SupportAdjustment[]
            memory adjustments = new Forum.SupportAdjustment[](1);
        adjustments[0] = _setToSupportAdjustment(0, 0);
        fractionalForum.adjustSupport(adjustments);

        uint[] memory statementIds = new uint[](1);
        statementIds[0] = 0;
        Forum.Statement[] memory statements = fractionalForum.getStatementsById(
            statementIds
        );
        assertEq(
            statements[0].support,
            0,
            "Fractional support part should clear exactly"
        );
        assertEq(
            fractionalForum.getUserStatementSupport().length,
            0,
            "No fractional support should remain visible"
        );
    }

    // ======================================================================
    // Section 1: Tests about adjusting statement support and its effect on ranking
    // ======================================================================

    function testSupportOfOneDoesNotCauseRanking() external registeredMember {
        forum.addStatement("Test statement", 0);
        _addStatementSupport(0, 1);

        Forum.Statement memory statement = _getStatementById(0);
        assertEq(statement.support, 1, "Support should be 1");
        assertEq(statement.rank, -1, "Statement should not be ranked");
        assertEq(forum.rankedCount(), 0, "Ranked count should be 0");
    }

    function testSupportGreaterThanOneCausesRanking()
        external
        registeredMember
    {
        forum.addStatement("Test statement", 0);
        _addStatementSupport(0, 2);

        Forum.Statement memory statement = _getStatementById(0);
        assertEq(statement.support, 2, "Support should be 2");
        assertEq(statement.rank, 0, "Statement should be ranked at position 0");
        assertEq(forum.rankedCount(), 1, "Ranked count should be 1");
    }

    function testRankingThresholdReturnsMinimumSupportWhenRankingHasRoom()
        external
        registeredMember
    {
        forum.addStatement("Statement A", 0);
        _addStatementSupport(0, 2);

        assertEq(
            forum.getRankingThreshold(),
            forum.minStatementSupportToRank(),
            "Threshold should be minimum support while ranking has room"
        );
    }

    function testRankingThresholdReturnsLowestRankedSupportPlusOneWhenFull()
        external
        registeredMember
    {
        forum.addStatement("Statement A", 0);
        forum.addStatement("Statement B", 0);
        forum.addStatement("Statement C", 0);

        Forum.SupportAdjustment[]
            memory adjustments = new Forum.SupportAdjustment[](3);
        adjustments[0] = _deltaSupportAdjustment(0, 5);
        adjustments[1] = _deltaSupportAdjustment(1, 4);
        adjustments[2] = _deltaSupportAdjustment(2, 3);
        forum.adjustSupport(adjustments);

        assertEq(forum.rankedCount(), 3, "Ranking should be full");
        assertEq(
            forum.getRankingThreshold(),
            4,
            "Threshold should exceed the lowest ranked support"
        );
    }

    function testRankedStatementRankChangesWithMoreSupport()
        external
        registeredMember
    {
        // Create and rank two statements
        forum.addStatement("Statement A", 0);
        forum.addStatement("Statement B", 0);
        _addStatementSupport(0, 3); // Rank 0
        _addStatementSupport(1, 2); // Rank 1

        // Verify initial rankings
        assertEq(_getStatementById(0).rank, 0, "Statement A should be rank 0");
        assertEq(_getStatementById(1).rank, 1, "Statement B should be rank 1");

        // Add more support to Statement B to overtake Statement A
        _nextBlock();
        _addStatementSupport(1, 2); // Now has 4 support total

        // Verify rankings changed
        assertEq(
            _getStatementById(0).rank,
            1,
            "Statement A should now be rank 1"
        );
        assertEq(
            _getStatementById(1).rank,
            0,
            "Statement B should now be rank 0"
        );
        assertEq(
            _getStatementById(1).support,
            4,
            "Statement B should have 4 support"
        );
    }

    function testRankedStatementRankDoesNotChangeWithSameSupport()
        external
        registeredMember
    {
        // Create and rank two statements
        forum.addStatement("Statement A", 0);
        forum.addStatement("Statement B", 0);
        _addStatementSupport(0, 5); // Rank 0
        _addStatementSupport(1, 3); // Rank 1

        // Add support to B but not enough to overtake A
        _nextBlock();
        _addStatementSupport(1, 1); // Now has 4 support total, still less than A

        // Verify rankings didn't change
        assertEq(
            _getStatementById(0).rank,
            0,
            "Statement A should still be rank 0"
        );
        assertEq(
            _getStatementById(1).rank,
            1,
            "Statement B should still be rank 1"
        );
    }

    function testRankedStatementTiePreservesExistingOrder()
        external
        registeredMember
    {
        forum.addStatement("Statement A", 0);
        forum.addStatement("Statement B", 0);
        _setStatementSupport(0, 5); // A has 5 support, rank 0
        _setStatementSupport(1, 3); // B has 3 support, rank 1

        _nextBlock();
        _setStatementSupport(1, 5); // B now matches A

        assertEq(
            _getStatementById(0).support,
            _getStatementById(1).support,
            "Statements should have equal support"
        );
        assertEq(
            _getStatementById(0).rank,
            0,
            "Statement A should keep rank 0 on tie"
        );
        assertEq(
            _getStatementById(1).rank,
            1,
            "Statement B should stay rank 1 on tie"
        );
    }

    function testRemovingSupportLowersRank() external registeredMember {
        // Create and rank three statements
        forum.addStatement("Statement A", 0);
        forum.addStatement("Statement B", 0);
        forum.addStatement("Statement C", 0);
        _addStatementSupport(0, 5); // Rank 0
        _addStatementSupport(1, 4); // Rank 1
        _addStatementSupport(2, 3); // Rank 2

        // Remove support from Statement A
        _nextBlock();
        _addStatementSupport(0, -3); // Now has 2 support

        // A should now be rank 2
        assertEq(
            _getStatementById(0).rank,
            2,
            "Statement A should now be rank 2"
        );
        assertEq(
            _getStatementById(1).rank,
            0,
            "Statement B should now be rank 0"
        );
        assertEq(
            _getStatementById(2).rank,
            1,
            "Statement C should now be rank 1"
        );
    }

    function testRemovingSupportToOneRemovesFromRanking()
        external
        registeredMember
    {
        forum.addStatement("Test statement", 0);
        _addStatementSupport(0, 3); // Gets ranked

        assertEq(_getStatementById(0).rank, 0, "Statement should be ranked");
        assertEq(forum.rankedCount(), 1, "Ranked count should be 1");

        // Remove support down to 1 (below ranking threshold of 2)
        _nextBlock();
        _addStatementSupport(0, -2);

        Forum.Statement memory statement = _getStatementById(0);
        assertEq(statement.support, 1, "Support should be 1");
        assertEq(statement.rank, -1, "Statement should not be ranked");
        assertEq(forum.rankedCount(), 0, "Ranked count should be 0");
    }

    function testRemovingSupportDoesNotChangeRankIfStillAboveOthers()
        external
        registeredMember
    {
        forum.addStatement("Statement A", 0);
        forum.addStatement("Statement B", 0);
        _addStatementSupport(0, 10); // Rank 0
        _addStatementSupport(1, 3); // Rank 1

        // Remove some support from A but it still has more than B
        _nextBlock();
        _addStatementSupport(0, -4); // Now has 6 support

        assertEq(
            _getStatementById(0).rank,
            0,
            "Statement A should still be rank 0"
        );
        assertEq(
            _getStatementById(1).rank,
            1,
            "Statement B should still be rank 1"
        );
        assertEq(
            _getStatementById(0).support,
            6,
            "Statement A should have 6 support"
        );
    }

    // ======================================================================
    // Section 2: Tests about user balance and cost of support adjustments
    // ======================================================================

    function testUserBalanceDecreasesWhenAddingSupport()
        external
        registeredMember
    {
        forum.addStatement("Test statement", 0);
        uint initialBalance = forum.getUserBalance();
        _addStatementSupport(0, 3);
        uint newBalance = forum.getUserBalance();
        assertEq(
            newBalance,
            initialBalance - 6,
            "Balance should decrease by 6 for 3 units of support"
        );
    }

    function testUserBalanceIncreasesWhenRemovingSupport()
        external
        registeredMember
    {
        forum.addStatement("Test statement", 0);
        _addStatementSupport(0, 5); // Cost: 15

        uint balanceBeforeRemoval = forum.getUserBalance();

        _nextBlock();
        _addStatementSupport(0, -2); // Refund cost of going from 5 to 3 = 15 - 6 = 9

        uint finalBalance = forum.getUserBalance();
        assertEq(
            finalBalance,
            balanceBeforeRemoval + 9,
            "Balance should increase by 9 when removing 2 units from 5"
        );
    }

    function testCannotAddSupportWithInsufficientBalance()
        external
        registeredMember
    {
        forum.addStatement("Test statement", 0);

        // Spend most of the balance
        _addStatementSupport(0, 44); // Cost: 990, balance: 1000 - 990 = 10

        // Try to add more support than balance allows
        // Going from 44 to 54 costs triangular(54) - triangular(44) = 1485 - 990 = 495
        _nextBlock();
        vm.expectRevert(
            abi.encodeWithSelector(Forum.InsufficientCredits.selector, 10, 495)
        );
        _addStatementSupport(0, 10);
    }

    function testCostIsTriangularNumber() external view {
        // Verify cost formula: cost(n) = n(n+1)/2
        assertEq(
            forum.exposed_costOfUserSupport(0),
            0,
            "Cost of 0 should be 0"
        );
        assertEq(
            forum.exposed_costOfUserSupport(1),
            1,
            "Cost of 1 should be 1"
        );
        assertEq(
            forum.exposed_costOfUserSupport(2),
            3,
            "Cost of 2 should be 3"
        );
        assertEq(
            forum.exposed_costOfUserSupport(3),
            6,
            "Cost of 3 should be 6"
        );
        assertEq(
            forum.exposed_costOfUserSupport(4),
            10,
            "Cost of 4 should be 10"
        );
        assertEq(
            forum.exposed_costOfUserSupport(5),
            15,
            "Cost of 5 should be 15"
        );
        assertEq(
            forum.exposed_costOfUserSupport(10),
            55,
            "Cost of 10 should be 55"
        );
        assertEq(
            forum.exposed_costOfUserSupport(100),
            5050,
            "Cost of 100 should be 5050"
        );
    }

    function testNegativeSupportCostSameAsPositive() external view {
        // Verify negative support has same cost as positive
        assertEq(
            forum.exposed_costOfUserSupport(-5),
            forum.exposed_costOfUserSupport(5),
            "Cost of -5 should equal cost of 5"
        );
        assertEq(
            forum.exposed_costOfUserSupport(-10),
            forum.exposed_costOfUserSupport(10),
            "Cost of -10 should equal cost of 10"
        );
    }

    function testMarginalCostIsCorrect() external registeredMember {
        forum.addStatement("Test statement", 0);

        // The marginal cost of the (n+1)th unit is n+1
        // When going from n to n+1, the cost change is:
        // triangular(n+1) - triangular(n) = (n+1)(n+2)/2 - n(n+1)/2 = (n+1)

        uint initialBalance = forum.getUserBalance();

        // 0 → 1: marginal cost = 1
        _addStatementSupport(0, 1);
        assertEq(
            forum.getUserBalance(),
            initialBalance - 1,
            "First unit should cost 1"
        );

        // 1 → 2: marginal cost = 2, total cost = 3
        _nextBlock();
        _addStatementSupport(0, 1);
        assertEq(
            forum.getUserBalance(),
            initialBalance - 3,
            "Second unit should bring total cost to 3"
        );

        // 2 → 3: marginal cost = 3, total cost = 6
        _nextBlock();
        _addStatementSupport(0, 1);
        assertEq(
            forum.getUserBalance(),
            initialBalance - 6,
            "Third unit should bring total cost to 6"
        );
    }

    function testMultipleSupportAdjustmentsInOneTransaction()
        external
        registeredMember
    {
        forum.addStatement("Statement A", 0);
        forum.addStatement("Statement B", 0);
        forum.addStatement("Statement C", 0);

        uint initialBalance = forum.getUserBalance();

        // Adjust support for multiple statements at once
        Forum.SupportAdjustment[]
            memory adjustments = new Forum.SupportAdjustment[](3);
        adjustments[0] = _deltaSupportAdjustment(0, 3);
        adjustments[1] = _deltaSupportAdjustment(1, 5);
        adjustments[2] = _deltaSupportAdjustment(2, 2);
        forum.adjustSupport(adjustments);

        // Total cost should be 6 + 15 + 3 = 24
        uint newBalance = forum.getUserBalance();
        assertEq(
            newBalance,
            initialBalance - 24,
            "Balance should decrease by total cost of all adjustments"
        );

        // Verify all statements have correct support
        assertEq(
            _getStatementById(0).support,
            3,
            "Statement A should have 3 support"
        );
        assertEq(
            _getStatementById(1).support,
            5,
            "Statement B should have 5 support"
        );
        assertEq(
            _getStatementById(2).support,
            2,
            "Statement C should have 2 support"
        );
    }

    // ======================================================================
    // Section 3: Tests related to decay of support over time
    // ======================================================================

    function testStatementSupportDecaysOverTime() external registeredMember {
        forum.addStatement("Test statement", 0);
        _addStatementSupport(0, 10);

        int supportBefore = _getStatementById(0).support;
        assertEq(supportBefore, 10, "Initial support should be 100");

        // Advance by 1 half-life (604800 seconds = 1 week)
        vm.warp(vm.getBlockTimestamp() + HALF_LIFE);

        int supportAfterHalfLife = _getStatementById(0).support;
        assertEq(
            supportAfterHalfLife,
            5,
            "Support should halve after 1 half-life"
        );

        // Advance another half-life (2 total)
        vm.warp(vm.getBlockTimestamp() + HALF_LIFE);

        int supportAfterTwoHalfLives = _getStatementById(0).support;
        assertEq(
            supportAfterTwoHalfLives,
            2,
            "Support should quarter after 2 half-lives"
        );
    }

    function testStatementFractionalSupportDecaysAfterOnePercentThreshold()
        external
        registeredMember
    {
        ForumHarness fractionalForum = new ForumHarness(
            mockRegistry,
            "",
            Forum.ForumConfig({
                maxRankedStatements: 3,
                creditAllowanceIntervalSeconds: CREDIT_ALLOWANCE_INTERVAL_SECONDS,
                engagementWindowSeconds: 60,
                maxStatementLength: 120,
                userCreditAllowancePerInterval: 25 * 100,
                userStartingCredits: 1000 * 100,
                minStatementSupportToRank: 2 * 100,
                minAdjustmentIntervalSeconds: 12,
                creditMultiplier: 100,
                refundPenaltyBps: 0,
                decaySpeedupFactor: 1,
                statementBurstCapacity: 1000,
                statementRefillIntervalSeconds: 60
            })
        );

        fractionalForum.addStatement("Fractional decay", 0);

        Forum.SupportAdjustment[]
            memory adjustments = new Forum.SupportAdjustment[](1);
        adjustments[0] = _setToSupportAdjustment(0, 100);
        fractionalForum.adjustSupport(adjustments);

        int supportBefore = fractionalForum
            .getStatementsById(_oneId(0))[0]
            .support;
        assertEq(
            supportBefore,
            100,
            "Initial fractional support should be 100"
        );

        vm.warp(vm.getBlockTimestamp() + 1 hours);
        assertEq(
            fractionalForum.getStatementsById(_oneId(0))[0].support,
            supportBefore,
            "Fractional support should not visibly decay before the threshold"
        );

        vm.warp(MOCK_TEST_TIMESTAMP + ONE_PERCENT_DECAY_SECONDS);

        assertEq(
            fractionalForum.getStatementsById(_oneId(0))[0].support,
            99,
            "Fractional support should decay to 99 at the 1% threshold"
        );
    }

    function testAdjustingSupportAccountsForDecay() external registeredMember {
        forum.addStatement("Test statement", 0);
        _addStatementSupport(0, 10);

        // Advance by 1 half-life so support decays from 10 to 5
        vm.warp(vm.getBlockTimestamp() + HALF_LIFE);

        int supportBeforeAdjustment = _getStatementById(0).support;
        _addStatementSupport(0, 5);

        int finalSupport = _getStatementById(0).support;
        assertEq(
            finalSupport,
            supportBeforeAdjustment + 5,
            "Support adjustment should be added to decayed value"
        );
    }

    function testRankingUpdatedAfterSupportDecay() external registeredMember {
        // Create two statements with different support levels
        forum.addStatement("Statement A", 0);
        forum.addStatement("Statement B", 0);
        _addStatementSupport(0, 20); // High initial support
        _addStatementSupport(1, 10); // Lower initial support

        assertEq(
            _getStatementById(0).rank,
            0,
            "Statement A should initially be rank 0"
        );
        assertEq(
            _getStatementById(1).rank,
            1,
            "Statement B should initially be rank 1"
        );

        // Wait 1 half-life for decay
        // A = 20 -> 10
        // B = 10 -> 5
        vm.warp(vm.getBlockTimestamp() + HALF_LIFE);

        // Trigger ranking update by adjusting support on B
        _addStatementSupport(1, 6);

        assertEq(
            _getStatementById(1).rank,
            0,
            "Statement B should now be rank 0"
        );
        assertEq(
            _getStatementById(0).rank,
            1,
            "Statement A should now be rank 1"
        );
    }

    function testUserStatementSupportDecaysOverTime()
        external
        registeredMember
    {
        forum.addStatement("Test statement", 0);
        _addStatementSupport(0, 10);

        // Check user's support immediately
        Forum.StatementSupport[] memory userSupport = forum
            .getUserStatementSupport();
        assertEq(
            userSupport.length,
            1,
            "User should have 1 supported statement"
        );
        assertEq(userSupport[0].support, 10, "User support should be 10");

        // Advance time by 1 half-life
        vm.warp(vm.getBlockTimestamp() + HALF_LIFE);

        // Check user's support after decay
        userSupport = forum.getUserStatementSupport();
        assertEq(
            userSupport.length,
            1,
            "User should still have 1 supported statement"
        );
        assertEq(
            userSupport[0].support,
            5,
            "User support should have decayed to 5"
        );

        // Advance time by another half-life (2 total)
        vm.warp(vm.getBlockTimestamp() + HALF_LIFE);

        // Check user's support after decay
        userSupport = forum.getUserStatementSupport();
        assertEq(
            userSupport.length,
            1,
            "User should still have 1 supported statement"
        );
        assertEq(
            userSupport[0].support,
            2,
            "User support should have decayed to 2"
        );
    }

    function testGetUserStatementSupportAfterFullDecay()
        external
        registeredMember
    {
        // Create two statements with different initial support levels.
        // Statement 0 gets low support (will decay to zero first).
        // Statement 1 gets higher support (will survive longer).
        forum.addStatement("Low support", 0);
        forum.addStatement("High support", 0);
        _addStatementSupport(0, 1);
        _addStatementSupport(1, 10);

        // Advance time so support=1 decays to 0, while support=10 survives.
        // 1 half-life: support=1 → 0 (1>>1=0), support=10 → 5.
        vm.warp(vm.getBlockTimestamp() + HALF_LIFE);

        // This call previously reverted due to an out-of-bounds array write.
        Forum.StatementSupport[] memory userSupport = forum
            .getUserStatementSupport();
        assertEq(
            userSupport.length,
            1,
            "Only the non-decayed statement should be returned"
        );
        assertEq(
            userSupport[0].statementId,
            1,
            "Surviving statement should be statement 1"
        );
    }

    function testUserBalanceAccountsForSupportDecay()
        external
        registeredMember
    {
        forum.addStatement("Test statement", 0);

        uint initialBalance = forum.getUserBalance();
        _addStatementSupport(0, 10); // Cost: 55

        uint balanceAfterSupport = forum.getUserBalance();
        assertEq(
            balanceAfterSupport,
            initialBalance - 55,
            "Balance should decrease by 55"
        );

        // Advance time to cause support decay (1 half-life)
        vm.warp(vm.getBlockTimestamp() + HALF_LIFE);

        // User's support has decayed to 5, which costs 15 instead of 55
        // When they remove all support, they should get back only the cost of current support
        _addStatementSupport(0, -5); // Current support is 5, removing it should refund 15

        uint finalBalance = forum.getUserBalance();
        // The refund should be 15 (cost of 5 support)
        // Plus the time-based allowance: 604800 / 60 = 10080 intervals * 25 credits
        uint expectedTimeAllowance = (HALF_LIFE /
            CREDIT_ALLOWANCE_INTERVAL_SECONDS) * 25;

        assertEq(
            finalBalance,
            balanceAfterSupport + 15 + expectedTimeAllowance,
            "Balance should account for decayed support cost and time allowance"
        );
    }

    function testStatementsFallOffUserSupportListWhenSupportDecaysToZero()
        external
        registeredMember
    {
        forum.addStatement("Test statement", 0);
        _addStatementSupport(0, 10);

        // Verify statement is in user's support list
        Forum.StatementSupport[] memory userSupport = forum
            .getUserStatementSupport();
        assertEq(
            userSupport.length,
            1,
            "User should have 1 supported statement"
        );
        assertEq(userSupport[0].statementId, 0, "Statement ID should be 0");
        assertEq(userSupport[0].support, 10, "User support should be 10");

        // Wait long enough for support to decay to 0 (4 half-lives)
        // 10 -> 5 -> 2 -> 1 -> 0
        vm.warp(vm.getBlockTimestamp() + HALF_LIFE * 4);

        // Check that the statement is no longer in user's support list
        userSupport = forum.getUserStatementSupport();
        assertEq(
            userSupport.length,
            0,
            "User should have no supported statements after decay to 0"
        );
    }

    function testLowestRankStatementIsEvictedWhenMaxRankedStatementsExceeded()
        external
        registeredMember
    {
        forum.addStatement("Statement A", 0);
        forum.addStatement("Statement B", 0);
        forum.addStatement("Statement C", 0);
        forum.addStatement("Statement D", 0);

        // Add support to fill up the ranking (maxRankedStatements = 3)
        Forum.SupportAdjustment[]
            memory adjustments = new Forum.SupportAdjustment[](3);
        adjustments[0] = _deltaSupportAdjustment(0, 5);
        adjustments[1] = _deltaSupportAdjustment(1, 4);
        adjustments[2] = _deltaSupportAdjustment(2, 3);
        forum.adjustSupport(adjustments);

        // Verify we have 3 ranked statements
        assertEq(forum.rankedCount(), 3, "Should have 3 ranked statements");
        assertEq(
            forum.getRankedStatement(0).id,
            0,
            "Statement A should be rank 0"
        );
        assertEq(
            forum.getRankedStatement(1).id,
            1,
            "Statement B should be rank 1"
        );
        assertEq(
            forum.getRankedStatement(2).id,
            2,
            "Statement C should be rank 2"
        );

        // Now add high support to Statement D, which should evict Statement C (lowest rank)
        _addStatementSupport(3, 6);

        // Verify we still have 3 ranked statements
        assertEq(
            forum.rankedCount(),
            3,
            "Should still have 3 ranked statements"
        );

        // Verify Statement D is now ranked
        assertEq(
            forum.getRankedStatement(0).id,
            3,
            "Statement D should be rank 0"
        );
        assertEq(
            forum.getRankedStatement(1).id,
            0,
            "Statement A should be rank 1"
        );
        assertEq(
            forum.getRankedStatement(2).id,
            1,
            "Statement B should be rank 2"
        );

        // Verify Statement C was evicted (rank should be -1)
        Forum.Statement memory evicted = _getStatementById(2);
        assertEq(evicted.rank, -1, "Statement C should no longer be ranked");
        assertEq(evicted.support, 3, "Statement C should still have 3 support");
    }

    // ======================================================================
    // Section 4: Tests for userSupportedStatements maintenance
    // ======================================================================

    function testNewItemsAreAddedToFirstEmptySlot() external registeredMember {
        // Create statements with initial support
        forum.addStatement("Statement A", 10);
        forum.addStatement("Statement B", 10);
        forum.addStatement("Statement C", 10);
        forum.addStatement("Statement D", 0);

        // Remove all support from B (creating an empty slot)
        _nextBlock();
        _addStatementSupport(1, -10);

        // Now add support to statement D
        // It should reuse the empty slot where B was (index 1)
        _addStatementSupport(3, 5);

        // Verify the final state by checking the order of returned statements
        // If D reused B's slot, the order should be A (index 0), D (index 1), C (index 2)
        Forum.StatementSupport[] memory userSupport = forum
            .getUserStatementSupport();
        assertEq(
            userSupport.length,
            3,
            "User should have 3 supported statements (A, C, D)"
        );

        // Check that statements are returned in order A, D, C
        assertEq(
            userSupport[0].statementId,
            0,
            "First statement should be A (index 0)"
        );
        assertEq(
            userSupport[0].support,
            10,
            "Statement A should have 10 support"
        );

        assertEq(
            userSupport[1].statementId,
            3,
            "Second statement should be D (reusing B's slot at index 1)"
        );
        assertEq(
            userSupport[1].support,
            5,
            "Statement D should have 5 support"
        );

        assertEq(
            userSupport[2].statementId,
            2,
            "Third statement should be C (index 2)"
        );
        assertEq(
            userSupport[2].support,
            10,
            "Statement C should have 10 support"
        );
    }

    function testArrayCompactsWhenTwoEmptySlotsExist()
        external
        registeredMember
    {
        // Create 5 statements with initial support
        forum.addStatement("Statement A", 10);
        forum.addStatement("Statement B", 10);
        forum.addStatement("Statement C", 10);
        forum.addStatement("Statement D", 10);
        forum.addStatement("Statement E", 10);

        // Verify we have 5 statements
        Forum.StatementSupport[] memory userSupport = forum
            .getUserStatementSupport();
        assertEq(userSupport.length, 5, "Should have 5 supported statements");

        // Get userId for raw array length checks
        bytes32 userId = keccak256(abi.encode(address(this)));

        // Check initial length
        uint initialLength = forum
            .exposed_userSupportedStatements(userId)
            .length;
        assertEq(initialLength, 5, "Initial raw array length should be 5");

        // Remove support from B (creating one empty slot at index 1)
        _nextBlock();
        _addStatementSupport(1, -10);

        // Remove support from C (creating second empty slot at index 2)
        // This triggers compaction: last occupied element (E at index 4) moves to index 2, array pops
        _addStatementSupport(2, -10);

        // Verify that raw array length reduced by 1 due to compaction
        uint lengthAfterRemovals = forum
            .exposed_userSupportedStatements(userId)
            .length;
        assertEq(
            lengthAfterRemovals,
            4,
            "Raw array length should reduce from 5 to 4 when creating two empty slots triggers compaction"
        );

        // Now add support to a new statement F
        forum.addStatement("Statement F", 0);
        _addStatementSupport(5, 5);

        // Verify array length stays at 4 (F just filled an empty slot)
        uint lengthAfterF = forum
            .exposed_userSupportedStatements(userId)
            .length;
        assertEq(
            lengthAfterF,
            4,
            "Raw array length should stay at 4 after F fills the first empty slot"
        );

        // Verify the array compacted and is now [A, F, E, D]
        userSupport = forum.getUserStatementSupport();
        assertEq(
            userSupport.length,
            4,
            "Array should have compacted to 4 statements"
        );

        // Check the order: A, F, E, D
        assertEq(userSupport[0].statementId, 0, "Index 0 should be A");
        assertEq(
            userSupport[1].statementId,
            5,
            "Index 1 should be F (filled first empty slot)"
        );
        assertEq(
            userSupport[2].statementId,
            4,
            "Index 2 should be E (moved from index 4 to second empty slot)"
        );
        assertEq(userSupport[3].statementId, 3, "Index 3 should be D");
    }

    // ======================================================================
    // Section: peakRank tracking
    // ======================================================================

    function testPeakRankIsNegativeOneForNewStatement()
        external
        registeredMember
    {
        forum.addStatement("Fresh statement", 0);
        Forum.Statement memory s = _getStatementById(0);
        assertEq(s.rank, -1, "New statement should not be ranked");
        assertEq(
            s.peakRank,
            -1,
            "peakRank should be -1 for never-ranked statement"
        );
    }

    function testPeakRankTracksFirstRanking() external registeredMember {
        forum.addStatement("Test statement", 0);
        _addStatementSupport(0, 3); // Gets ranked at position 0

        Forum.Statement memory s = _getStatementById(0);
        assertEq(s.rank, 0, "Statement should be ranked at 0");
        assertEq(s.peakRank, 0, "peakRank should be 0 after first ranking");
    }

    function testPeakRankImprovesWhenRankImproves() external registeredMember {
        forum.addStatement("Statement A", 0);
        forum.addStatement("Statement B", 0);
        _addStatementSupport(0, 5); // Rank 0
        _addStatementSupport(1, 3); // Rank 1

        assertEq(
            _getStatementById(1).peakRank,
            1,
            "B peakRank should be 1 initially"
        );

        // Give B more support so it overtakes A
        _nextBlock();
        _addStatementSupport(1, 4); // B now has 7, overtakes A (5)

        assertEq(_getStatementById(1).rank, 0, "B should now be rank 0");
        assertEq(
            _getStatementById(1).peakRank,
            0,
            "B peakRank should improve to 0"
        );
    }

    function testPeakRankDoesNotWorsenWhenRankDrops()
        external
        registeredMember
    {
        forum.addStatement("Statement A", 0);
        forum.addStatement("Statement B", 0);
        _addStatementSupport(0, 5); // Rank 0
        _addStatementSupport(1, 3); // Rank 1

        assertEq(_getStatementById(0).peakRank, 0, "A peakRank should be 0");

        // Give B more support so it overtakes A → A drops to rank 1
        _nextBlock();
        _addStatementSupport(1, 4); // B=7, A=5

        assertEq(_getStatementById(0).rank, 1, "A should now be rank 1");
        assertEq(
            _getStatementById(0).peakRank,
            0,
            "A peakRank should remain 0 even though current rank is 1"
        );
    }

    function testPeakRankPreservedAfterEviction() external registeredMember {
        // maxRankedStatements = 3 from setUp, so fill 3 slots then evict the lowest
        forum.addStatement("Statement A", 0);
        forum.addStatement("Statement B", 0);
        forum.addStatement("Statement C", 0);
        forum.addStatement("Statement D", 0);

        // Rank A, B, C to fill all 3 slots
        _addStatementSupport(0, 6); // Rank 0
        _addStatementSupport(1, 4); // Rank 1
        _addStatementSupport(2, 3); // Rank 2

        // C is at rank 2 — its peakRank should be 2
        assertEq(_getStatementById(2).peakRank, 2, "C peakRank should be 2");

        // Now give D enough support to evict C
        _addStatementSupport(3, 5); // D gets rank 1, C evicted

        // C should be evicted (rank -1), but peakRank preserved at 2
        Forum.Statement memory sC = _getStatementById(2);
        assertEq(sC.rank, -1, "C should be evicted");
        assertEq(sC.peakRank, 2, "C peakRank should still be 2 after eviction");
    }

    function testPeakRankTracksDisplacedStatements() external registeredMember {
        // When statement X rises in rank, statements it displaces get
        // their rank set via _setStatementRank, which should also track peakRank.
        forum.addStatement("Statement A", 0);
        forum.addStatement("Statement B", 0);
        forum.addStatement("Statement C", 0);
        _addStatementSupport(0, 6); // Rank 0
        _addStatementSupport(1, 4); // Rank 1
        _addStatementSupport(2, 2); // Rank 2

        // B has peakRank 1, C has peakRank 2
        assertEq(_getStatementById(1).peakRank, 1, "B peakRank should be 1");
        assertEq(_getStatementById(2).peakRank, 2, "C peakRank should be 2");

        // Remove support from A so it drops below both B and C
        _nextBlock();
        _addStatementSupport(0, -5); // A now has 1 support → unranked or rank 2

        // B and C should have moved up. B→0, C→1
        assertEq(_getStatementById(1).rank, 0, "B should be rank 0");
        assertEq(_getStatementById(2).rank, 1, "C should be rank 1");

        // peakRank should have improved for both
        assertEq(
            _getStatementById(1).peakRank,
            0,
            "B peakRank should improve to 0"
        );
        assertEq(
            _getStatementById(2).peakRank,
            1,
            "C peakRank should improve to 1"
        );
    }

    // ======================================================================
    // Section: StatementRankChanged event
    // ======================================================================

    function testRankChangedEmittedOnAddStatementSupport()
        external
        registeredMember
    {
        forum.addStatement("Statement A", 0);
        vm.expectEmit(true, false, false, true);
        emit Forum.StatementRankChanged(0, -1, 0);
        _addStatementSupport(0, 3); // Statement A should go from unranked (-1) to rank 0
    }

    function testRankChangedEmittedWhenStatementsSwap()
        external
        registeredMember
    {
        forum.addStatement("Statement A", 0);
        forum.addStatement("Statement B", 0);
        _addStatementSupport(0, 5); // A rank 0
        _addStatementSupport(1, 3); // B rank 1

        // Give B enough to overtake A: A displaced 0→1, B rises 1→0
        vm.expectEmit(true, false, false, true);
        emit Forum.StatementRankChanged(0, 0, 1);
        vm.expectEmit(true, false, false, true);
        emit Forum.StatementRankChanged(1, 1, 0);
        _nextBlock();
        _addStatementSupport(1, 4); // B now has 7 > A's 5
    }

    function testRankChangedEmittedWhenStatementEvictedByMaxRank()
        external
        registeredMember
    {
        // maxRankedStatements = 3
        forum.addStatement("Statement A", 0);
        forum.addStatement("Statement B", 0);
        forum.addStatement("Statement C", 0);
        forum.addStatement("Statement D", 0); // NOT ranked (4th exceeds max)

        _addStatementSupport(0, 6); // A rank 0
        _addStatementSupport(1, 4); // B rank 1
        _addStatementSupport(2, 3); // C rank 2

        // D with support 5 evicts C, displaces B, enters at rank 1
        vm.expectEmit(true, false, false, true);
        emit Forum.StatementRankChanged(2, 2, -1); // C evicted
        vm.expectEmit(true, false, false, true);
        emit Forum.StatementRankChanged(1, 1, 2); // B displaced to rank 2
        vm.expectEmit(true, false, false, true);
        emit Forum.StatementRankChanged(3, -1, 1); // D enters at rank 1
        _addStatementSupport(3, 5);
    }

    function testRankChangedEmittedByMaintenanceEviction()
        external
        registeredMember
    {
        forum.addStatement("Statement A", 0);
        forum.addStatement("Statement B", 0);
        _addStatementSupport(0, 5);
        _addStatementSupport(1, 3);

        // Push B's support negative to trigger maintenance eviction
        vm.expectEmit(true, false, false, true);
        emit Forum.StatementRankChanged(1, 1, -1);
        _nextBlock();
        _addStatementSupport(1, -4); // B support goes to -1
    }

    function testNoRankChangedEmittedWhenRankUnchanged()
        external
        registeredMember
    {
        forum.addStatement("Statement A", 0);
        forum.addStatement("Statement B", 0);
        _addStatementSupport(0, 10); // Rank 0
        _addStatementSupport(1, 3); // Rank 1

        // Adding more support to A doesn't change its rank (still 0)
        // We record logs and check no StatementRankChanged was emitted for id 0
        vm.recordLogs();
        _nextBlock();
        _addStatementSupport(0, 1);

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 rankChangedSig = keccak256(
            "StatementRankChanged(uint256,int256,int256)"
        );
        for (uint i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == rankChangedSig) {
                // If a rank changed event was emitted, it should NOT be for statement 0
                // (statement 0's rank should not have changed)
                uint emittedId = uint(logs[i].topics[1]);
                assertTrue(
                    emittedId != 0,
                    "Should not emit rank change for statement 0"
                );
            }
        }
    }

    function testSupportBelowThresholdUnranksImmediatelyFromMiddle()
        external
        registeredMember
    {
        // Three ranked statements; remove support from the top-ranked one
        // so it drops below threshold. It should be unranked immediately,
        // not deferred to maintenance.
        forum.addStatement("Statement A", 0);
        forum.addStatement("Statement B", 0);
        forum.addStatement("Statement C", 0);
        _addStatementSupport(0, 6); // Rank 0
        _addStatementSupport(1, 4); // Rank 1
        _addStatementSupport(2, 3); // Rank 2

        assertEq(forum.rankedCount(), 3, "All three should be ranked");

        // Drop A's support to 1 (below minStatementSupportToRank = 2)
        _nextBlock();
        _addStatementSupport(0, -5);

        Forum.Statement memory sA = _getStatementById(0);
        assertEq(sA.rank, -1, "Statement A should be immediately unranked");
        assertEq(
            forum.rankedCount(),
            2,
            "Ranked count should be 2 after eviction"
        );

        // B and C should remain ranked and compact correctly
        Forum.Statement memory sB = _getStatementById(1);
        Forum.Statement memory sC = _getStatementById(2);
        assertEq(sB.rank, 0, "Statement B should be rank 0");
        assertEq(sC.rank, 1, "Statement C should be rank 1");
    }

    function testSupportBelowThresholdUnranksFromSecondPosition()
        external
        registeredMember
    {
        // Remove support from the middle-ranked statement
        forum.addStatement("Statement A", 0);
        forum.addStatement("Statement B", 0);
        forum.addStatement("Statement C", 0);
        _addStatementSupport(0, 6); // Rank 0
        _addStatementSupport(1, 4); // Rank 1
        _addStatementSupport(2, 3); // Rank 2

        // Drop B's support below threshold
        _nextBlock();
        _addStatementSupport(1, -3); // B now has 1 support

        Forum.Statement memory sB = _getStatementById(1);
        assertEq(sB.rank, -1, "Statement B should be immediately unranked");
        assertEq(forum.rankedCount(), 2, "Ranked count should be 2");

        // A stays rank 0, C moves up to rank 1
        assertEq(_getStatementById(0).rank, 0, "Statement A should be rank 0");
        assertEq(_getStatementById(2).rank, 1, "Statement C should be rank 1");
    }

    // ======================================================================
    // Section: StatementEngaged event
    // ======================================================================

    function testEngagedEmittedOnFirstInteraction() external registeredMember {
        forum.addStatement("Statement A", 0);

        // First interaction should always emit (lastEngagementEventTimestamp = 0)
        vm.recordLogs();
        _addStatementSupport(0, 1);

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 engagedSig = keccak256("StatementEngaged(uint256)");
        bool found = false;
        for (uint i = 0; i < logs.length; i++) {
            if (
                logs[i].topics[0] == engagedSig && uint(logs[i].topics[1]) == 0
            ) {
                found = true;
            }
        }
        assertTrue(
            found,
            "StatementEngaged should be emitted on first interaction"
        );
    }

    function testEngagedNotEmittedWithinWindow() external registeredMember {
        forum.addStatement("Statement A", 0);
        _addStatementSupport(0, 1); // First interaction emits

        // Interact again within the engagement window (< 60s)
        vm.warp(vm.getBlockTimestamp() + 30);

        vm.recordLogs();
        _addStatementSupport(0, 1);

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 engagedSig = keccak256("StatementEngaged(uint256)");
        bool found = false;
        for (uint i = 0; i < logs.length; i++) {
            if (
                logs[i].topics[0] == engagedSig && uint(logs[i].topics[1]) == 0
            ) {
                found = true;
            }
        }
        assertFalse(
            found,
            "StatementEngaged should not be emitted within window"
        );
    }

    function testEngagedEmittedAfterWindowExpires() external registeredMember {
        forum.addStatement("Statement A", 0);
        _addStatementSupport(0, 1); // First interaction emits

        // Advance past the engagement window (>= 60s)
        vm.warp(vm.getBlockTimestamp() + 60);

        vm.expectEmit(true, false, false, false);
        emit Forum.StatementEngaged(0);
        _addStatementSupport(0, 1);
    }

    function testEngagedWindowIsPerStatement() external registeredMember {
        forum.addStatement("Statement A", 0);
        forum.addStatement("Statement B", 0);

        _addStatementSupport(0, 1); // Emits for A

        // Advance 30s (within A's window)
        vm.warp(vm.getBlockTimestamp() + 30);

        // First interaction with B should emit regardless of A's cooldown
        vm.recordLogs();
        _addStatementSupport(1, 1);

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 engagedSig = keccak256("StatementEngaged(uint256)");
        bool found = false;
        for (uint i = 0; i < logs.length; i++) {
            if (
                logs[i].topics[0] == engagedSig && uint(logs[i].topics[1]) == 1
            ) {
                found = true;
            }
        }
        assertTrue(
            found,
            "StatementEngaged should emit for B independently of A's cooldown"
        );
    }

    function testEngagedTimestampResetsOnEmission() external registeredMember {
        forum.addStatement("Statement A", 0);
        _addStatementSupport(0, 1); // t=0, emits

        // Advance past window
        vm.warp(vm.getBlockTimestamp() + 60); // t=60
        _addStatementSupport(0, 1); // Emits, resets timestamp to t=60

        // Advance only 30s from the RESET timestamp (not from original)
        vm.warp(vm.getBlockTimestamp() + 30); // t=90

        vm.recordLogs();
        _addStatementSupport(0, 1);

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 engagedSig = keccak256("StatementEngaged(uint256)");
        bool found = false;
        for (uint i = 0; i < logs.length; i++) {
            if (
                logs[i].topics[0] == engagedSig && uint(logs[i].topics[1]) == 0
            ) {
                found = true;
            }
        }
        assertFalse(
            found,
            "StatementEngaged should not emit before window from last emission"
        );

        // Advance another 30s (now 60s from reset)
        vm.warp(vm.getBlockTimestamp() + 30); // t=120

        vm.expectEmit(true, false, false, false);
        emit Forum.StatementEngaged(0);
        _addStatementSupport(0, 1);
    }

    // ======================================================================
    // Multicall tests (reproducing frontend flow)
    // ======================================================================

    function testMulticallAdjustSupport() external registeredMember {
        // Step 1: Create a statement directly
        forum.addStatement("Test statement", 1);
        _nextBlock();

        // Step 2: Adjust support via multicall (exactly how the frontend does it)
        Forum.SupportAdjustment[]
            memory adjustments = new Forum.SupportAdjustment[](1);
        adjustments[0] = _deltaSupportAdjustment(0, 1);

        bytes[] memory calls = new bytes[](1);
        calls[0] = abi.encodeCall(Forum.adjustSupport, (adjustments));

        forum.multicall(calls);

        // Verify the support was applied
        Forum.Statement memory stmt = _getStatementById(0);
        assertTrue(stmt.support > 1, "Support should have increased");
    }

    function testMulticallAddStatementThenAdjustSupport()
        external
        registeredMember
    {
        // When the frontend commits both a new statement and support
        // adjustments in the same multicall, the adjustSupport targets
        // EXISTING statements, not the just-created one (which would
        // hit DuplicateAdjustment because lastUpdated == block.timestamp).
        forum.addStatement("Pre-existing statement", 1);
        assertEq(
            _getStatementById(0).support,
            1,
            "Pre-existing statement should start with 1 support"
        );
        _nextBlock();

        bytes[] memory calls = new bytes[](2);

        // Call 1: addStatement (new statement)
        calls[0] = abi.encodeCall(
            Forum.addStatement,
            ("Multicall statement", 0)
        );

        // Call 2: adjustSupport on statement 0 (the pre-existing one)
        Forum.SupportAdjustment[]
            memory adjustments = new Forum.SupportAdjustment[](1);
        adjustments[0] = _deltaSupportAdjustment(0, 1);
        calls[1] = abi.encodeCall(Forum.adjustSupport, (adjustments));

        forum.multicall(calls);

        Forum.Statement memory stmt = _getStatementById(0);
        assertEq(
            stmt.support,
            2,
            "Multicall adjustment should increase support from 1 to 2"
        );
    }

    function testMulticallAdjustSupportAfterDelay() external registeredMember {
        // Create statement and wait significant time before adjusting
        // via multicall — tests the decay path with large elapsedSeconds
        forum.addStatement("Decay test", 44);

        int initialSupport = _getStatementById(0).support;
        assertEq(initialSupport, 44, "Initial support should be 44");

        // Wait long enough for integer-rounded decay to be visible.
        vm.warp(block.timestamp + 1 days);

        int decayedSupport = _getStatementById(0).support;
        assertLt(
            decayedSupport,
            initialSupport,
            "Support should visibly decay before multicall adjustment"
        );

        Forum.SupportAdjustment[]
            memory adjustments = new Forum.SupportAdjustment[](1);
        adjustments[0] = _deltaSupportAdjustment(0, 1);

        bytes[] memory calls = new bytes[](1);
        calls[0] = abi.encodeCall(Forum.adjustSupport, (adjustments));

        forum.multicall(calls);

        int supportAfterMulticall = _getStatementById(0).support;
        assertGt(
            supportAfterMulticall,
            decayedSupport,
            "Multicall adjustment should increase decayed support"
        );
    }

    function testMulticallAdjustSupportAfterLongDelay()
        external
        registeredMember
    {
        // Create statement and wait a very long time
        forum.addStatement("Long decay test", 5);

        // Wait 30 days
        vm.warp(block.timestamp + 30 days);

        Forum.SupportAdjustment[]
            memory adjustments = new Forum.SupportAdjustment[](1);
        adjustments[0] = _deltaSupportAdjustment(0, 1);

        bytes[] memory calls = new bytes[](1);
        calls[0] = abi.encodeCall(Forum.adjustSupport, (adjustments));

        forum.multicall(calls);
    }
}

// ======================================================================
// Separate test contract for refund penalty behaviour
// ======================================================================

contract ForumRefundPenaltyTest is Test {
    uint constant MOCK_TEST_TIMESTAMP = 1767572100;
    uint constant CREDIT_ALLOWANCE_INTERVAL_SECONDS = 60;
    uint constant HALF_LIFE = 604800;
    DevSymvoliaRegistry mockRegistry;
    ForumHarness forum;

    function setUp() public {
        vm.warp(MOCK_TEST_TIMESTAMP);
        mockRegistry = new DevSymvoliaRegistry();
        forum = new ForumHarness(
            mockRegistry,
            "",
            Forum.ForumConfig({
                maxRankedStatements: 3,
                creditAllowanceIntervalSeconds: CREDIT_ALLOWANCE_INTERVAL_SECONDS,
                engagementWindowSeconds: 60,
                maxStatementLength: 120,
                userCreditAllowancePerInterval: 25,
                userStartingCredits: 1000,
                minStatementSupportToRank: 2,
                minAdjustmentIntervalSeconds: 12,
                creditMultiplier: 1,
                refundPenaltyBps: 2000,
                decaySpeedupFactor: 1,
                statementBurstCapacity: 1000,
                statementRefillIntervalSeconds: 60
            })
        );
    }

    function _nextBlock() internal {
        vm.warp(block.timestamp + forum.minAdjustmentIntervalSeconds());
    }

    modifier registeredMember() {
        mockRegistry.register("");
        _;
    }

    function _deltaSupportAdjustment(
        uint _statementId,
        int _value
    ) internal pure returns (Forum.SupportAdjustment memory) {
        return
            Forum.SupportAdjustment({
                statementId: _statementId,
                value: _value,
                adjustmentType: Forum.SupportAdjustmentType.Delta
            });
    }

    function _addStatementSupport(uint _statementId, int _value) internal {
        Forum.SupportAdjustment[]
            memory adjustments = new Forum.SupportAdjustment[](1);
        adjustments[0] = _deltaSupportAdjustment(_statementId, _value);
        forum.adjustSupport(adjustments);
    }

    function testRefundPenaltyBpsIsSet() external view {
        assertEq(
            forum.refundPenaltyBps(),
            2000,
            "refundPenaltyBps should be 2000"
        );
    }

    function testRefundPenaltyAppliedOnWithdrawal() external registeredMember {
        forum.addStatement("Test statement", 0);
        _addStatementSupport(0, 5); // Cost: 15, balance: 1000 - 15 = 985

        uint balanceBeforeRemoval = forum.getUserBalance();

        _nextBlock();
        _addStatementSupport(0, -2); // Reducing from 5 to 3: refund = 15 - 6 = 9

        uint finalBalance = forum.getUserBalance();
        // With 20% penalty: refund = 9, penalty = 1 (floor(9 * 2000 / 10000)), net refund = 8
        // Note: 9 * 2000 / 10000 = 1.8 → truncated to 1
        assertEq(
            finalBalance,
            balanceBeforeRemoval + 8,
            "Refund should be 8 after 20% penalty on 9 (penalty=1 truncated)"
        );
    }

    function testNoPenaltyWhenAddingSupport() external registeredMember {
        forum.addStatement("Test statement", 0);
        uint initialBalance = forum.getUserBalance();

        _addStatementSupport(0, 3); // Cost: 6

        uint finalBalance = forum.getUserBalance();
        assertEq(
            finalBalance,
            initialBalance - 6,
            "Adding support should cost full amount with no penalty"
        );
    }

    function testNoPenaltyOnNetZeroReallocation() external registeredMember {
        forum.addStatement("Statement A", 0);
        forum.addStatement("Statement B", 0);
        // Add support to A: cost(3) = 6
        _addStatementSupport(0, 3);

        uint balanceBeforeReallocation = forum.getUserBalance();

        // Reallocate: reduce A from 3 to 0 (refund 6), increase B from 0 to 3 (cost 6)
        // Net cost change = 0, so no penalty
        _nextBlock();
        Forum.SupportAdjustment[]
            memory adjustments = new Forum.SupportAdjustment[](2);
        adjustments[0] = _deltaSupportAdjustment(0, -3);
        adjustments[1] = _deltaSupportAdjustment(1, 3);
        forum.adjustSupport(adjustments);

        uint finalBalance = forum.getUserBalance();
        assertEq(
            finalBalance,
            balanceBeforeReallocation,
            "Net-zero reallocation should incur no penalty"
        );
    }

    function testPenaltyOnlyOnNetRefund() external registeredMember {
        forum.addStatement("Statement A", 0);
        forum.addStatement("Statement B", 0);
        // A: cost(20) = 20*21/2 = 210
        _addStatementSupport(0, 20);
        // B: cost(10) = 10*11/2 = 55
        _addStatementSupport(1, 10);

        uint balanceBefore = forum.getUserBalance();

        _nextBlock();
        // Reduce A from 20 to 0 (refund 210), increase B from 10 to 15 (cost 120 - 55 = 65)
        // Net cost change = 65 - 210 = -145 (refund of 145)
        // Penalty = 145 * 2000 / 10000 = 29 (exact, no rounding). Net refund = 116
        Forum.SupportAdjustment[]
            memory adjustments = new Forum.SupportAdjustment[](2);
        adjustments[0] = _deltaSupportAdjustment(0, -20);
        adjustments[1] = _deltaSupportAdjustment(1, 5);
        forum.adjustSupport(adjustments);

        uint finalBalance = forum.getUserBalance();
        assertEq(
            finalBalance,
            balanceBefore + 116,
            "Should receive net refund of 116 after 20% penalty on 145"
        );
    }

    function testFullWithdrawalPenalty() external registeredMember {
        forum.addStatement("Test statement", 0);
        _addStatementSupport(0, 10); // Cost: 55, balance: 1000 - 55 = 945

        uint balanceBefore = forum.getUserBalance();

        _nextBlock();
        _addStatementSupport(0, -10); // Full withdrawal, refund 55

        uint finalBalance = forum.getUserBalance();
        // Penalty = floor(55 * 2000 / 10000) = 11. Net refund = 44
        assertEq(
            finalBalance,
            balanceBefore + 44,
            "Full withdrawal should refund 44 after 20% penalty on 55"
        );
    }
}

/// @dev Exercises the per-user statement-creation token bucket with a small
///      capacity so limits are hit within a test.
contract ForumStatementRateLimitTest is Test {
    uint constant MOCK_TEST_TIMESTAMP = 1767572100;
    uint constant BURST_CAPACITY = 5;
    uint constant REFILL_INTERVAL = 14400; // 4 hours

    DevSymvoliaRegistry mockRegistry;
    ForumHarness forum;

    function setUp() public {
        vm.warp(MOCK_TEST_TIMESTAMP);
        mockRegistry = new DevSymvoliaRegistry();
        forum = new ForumHarness(
            mockRegistry,
            "",
            Forum.ForumConfig({
                maxRankedStatements: 100,
                creditAllowanceIntervalSeconds: 60,
                engagementWindowSeconds: 60,
                maxStatementLength: 120,
                userCreditAllowancePerInterval: 25,
                userStartingCredits: 1000,
                minStatementSupportToRank: 2,
                minAdjustmentIntervalSeconds: 12,
                creditMultiplier: 1,
                refundPenaltyBps: 0,
                decaySpeedupFactor: 1,
                statementBurstCapacity: BURST_CAPACITY,
                statementRefillIntervalSeconds: REFILL_INTERVAL
            })
        );
    }

    modifier registeredMember() {
        mockRegistry.register("");
        _;
    }

    function testEmptyStatementReverts() external registeredMember {
        vm.expectRevert(Forum.EmptyStatement.selector);
        forum.addStatement("", 0);
    }

    function testBurstUpToCapacitySucceeds() external registeredMember {
        for (uint i = 0; i < BURST_CAPACITY; i++) {
            forum.addStatement("statement", 0);
        }
        (uint available, uint nextRefill) = forum.getStatementAllowance();
        assertEq(available, 0, "Bucket should be empty after a full burst");
        assertEq(
            nextRefill,
            block.timestamp + REFILL_INTERVAL,
            "Next refill should be one interval away"
        );
    }

    function testExceedingCapacityReverts() external registeredMember {
        for (uint i = 0; i < BURST_CAPACITY; i++) {
            forum.addStatement("statement", 0);
        }
        vm.expectRevert(
            abi.encodeWithSelector(
                Forum.StatementRateLimited.selector,
                block.timestamp + REFILL_INTERVAL
            )
        );
        forum.addStatement("one too many", 0);
    }

    function testTokenRegainedAfterInterval() external registeredMember {
        for (uint i = 0; i < BURST_CAPACITY; i++) {
            forum.addStatement("statement", 0);
        }

        // After one refill interval, exactly one token is available again.
        vm.warp(block.timestamp + REFILL_INTERVAL);
        (uint available, ) = forum.getStatementAllowance();
        assertEq(available, 1, "Exactly one token should be regained");

        forum.addStatement("after refill", 0);

        vm.expectRevert(
            abi.encodeWithSelector(
                Forum.StatementRateLimited.selector,
                block.timestamp + REFILL_INTERVAL
            )
        );
        forum.addStatement("empty again", 0);
    }

    function testAllowanceCapsAtCapacityAfterLongIdle()
        external
        registeredMember
    {
        forum.addStatement("statement", 0);

        // Idle far longer than capacity * interval; allowance must cap.
        vm.warp(block.timestamp + REFILL_INTERVAL * 1000);
        (uint available, uint nextRefill) = forum.getStatementAllowance();
        assertEq(
            available,
            BURST_CAPACITY,
            "Allowance should cap at burst capacity"
        );
        assertEq(nextRefill, 0, "A full bucket has no pending refill");
    }

    function testInitialAllowanceIsFullCapacity() external registeredMember {
        (uint available, uint nextRefill) = forum.getStatementAllowance();
        assertEq(
            available,
            BURST_CAPACITY,
            "A fresh user starts with a full bucket"
        );
        assertEq(nextRefill, 0, "A full bucket has no pending refill");
    }

    function testSubIntervalRemainderIsCarried() external registeredMember {
        for (uint i = 0; i < BURST_CAPACITY; i++) {
            forum.addStatement("statement", 0);
        }

        // Advance 1.5 intervals: one token refills, half an interval carries.
        vm.warp(block.timestamp + REFILL_INTERVAL + REFILL_INTERVAL / 2);
        forum.addStatement("after partial refill", 0);

        // Only half an interval more (total 2 intervals since the burst) is
        // needed for the next token, proving the remainder was carried.
        vm.warp(block.timestamp + REFILL_INTERVAL / 2);
        (uint available, ) = forum.getStatementAllowance();
        assertEq(
            available,
            1,
            "Carried remainder should speed the next refill"
        );
    }

    function testMulticallBurstBeyondCapacityRevertsAtomically()
        external
        registeredMember
    {
        bytes[] memory calls = new bytes[](BURST_CAPACITY + 1);
        for (uint i = 0; i < calls.length; i++) {
            calls[i] = abi.encodeCall(
                Forum.addStatement,
                ("statement", int(0))
            );
        }

        vm.expectRevert(
            abi.encodeWithSelector(
                Forum.StatementRateLimited.selector,
                block.timestamp + REFILL_INTERVAL
            )
        );
        forum.multicall(calls);

        // The whole batch reverted, so no statements were recorded.
        assertEq(
            forum.statementCount(),
            0,
            "Atomic revert should leave no statements"
        );
    }
}
