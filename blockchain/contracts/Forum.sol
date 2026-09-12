// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import "./ISymvoliaRegistry.sol";
import "./StringUtils.sol";
import "./DecayUtils.sol";
import "./TokenBucket.sol";
import "@openzeppelin/contracts/utils/Multicall.sol";

// All credit values are denominated in fractional parts (e.g. microcredits).
// The creditMultiplier parameter defines the number of parts per whole credit.

contract Forum is Multicall {
    // Custom errors
    error NotMember();
    error RankOutOfBounds(uint rank, uint rankedCount);
    error StartOutOfBounds(uint start, uint statementCount);
    error InvalidStatementId(uint statementId);
    error StatementTooLong(uint length, uint maxLength);
    error UserNotRegistered(address user);
    error InsufficientCredits(uint available, int required);
    error TimestampOrderInvalid(uint fromTimestamp, uint toTimestamp);
    error DuplicateAdjustment(uint statementId);
    error EmptyStatement();
    error StatementRateLimited(uint retryAfterTimestamp);

    // Maximum length (in bytes) of a statement
    uint public immutable maxStatementLength;
    // Amount of credits a user is credited each credit allowance interval
    uint public immutable userCreditAllowancePerInterval;
    // Starting credits for a new user
    uint public immutable userStartingCredits;
    // Minimum support required for a statement to be ranked
    int public immutable minStatementSupportToRank;
    // We only track this many statements for ranking purposes
    uint public immutable maxRankedStatements;
    // Duration of a single credit allowance interval in seconds
    uint public immutable creditAllowanceIntervalSeconds;
    // Minimum seconds between StatementEngaged events for the same statement
    uint public immutable engagementWindowSeconds;
    // Minimum seconds between support adjustments for the same user+statement
    uint public immutable minAdjustmentIntervalSeconds;
    // Credit multiplier (e.g. 10^6 for microcredits)
    uint public immutable creditMultiplier;
    // Refund penalty in basis points (e.g. 2000 = 20%)
    uint public immutable refundPenaltyBps;
    // Multiplier to speed up decay for testing (1 = normal, 2016 = 5-min half-life)
    uint public immutable decaySpeedupFactor;
    // Maximum statements a user can create in a burst (token-bucket capacity)
    uint public immutable statementBurstCapacity;
    // Seconds to regain one statement-creation token
    uint public immutable statementRefillIntervalSeconds;

    ASymvoliaRegistry public symvoliaRegistry;

    struct ForumConfig {
        uint maxRankedStatements;
        uint creditAllowanceIntervalSeconds;
        uint engagementWindowSeconds;
        uint maxStatementLength;
        uint userCreditAllowancePerInterval;
        uint userStartingCredits;
        int minStatementSupportToRank;
        uint minAdjustmentIntervalSeconds;
        uint creditMultiplier;
        uint refundPenaltyBps;
        uint decaySpeedupFactor;
        uint statementBurstCapacity;
        uint statementRefillIntervalSeconds;
    }

    enum SupportAdjustmentType {
        Delta,
        SetTo
    }

    struct SupportAdjustment {
        uint statementId;
        int value;
        SupportAdjustmentType adjustmentType;
    }

    struct StatementSupport {
        uint statementId;
        int support;
    }

    struct Support {
        int value;
        uint lastUpdated;
    }

    struct StatementImpl {
        uint id;
        string text;
        uint createdTimestamp;
        Support support;
        int rank;
        int peakRank; // best (lowest) rank ever achieved; -1 if never ranked
        uint lastEngagementEventTimestamp;
    }

    struct Statement {
        uint id;
        string text;
        uint createdTimestamp;
        int support;
        int rank;
        int peakRank;
    }

    // number of statements in the forum
    uint public statementCount;
    // statement ID -> StatementImpl
    mapping(uint => StatementImpl) public statements;

    // rank -> statement ID
    uint[] public statementRankings;
    // number of ranked statements
    uint public rankedCount;

    mapping(bytes32 => mapping(uint => Support)) public userSupportMap;
    mapping(bytes32 => uint[]) internal _userSupportedStatements;

    struct UserBalance {
        uint credits;
        uint lastUpdated;
    }

    mapping(bytes32 => UserBalance) public userCredits;

    // Per-user statement-creation rate limiter (token bucket), keyed by the
    // registered identity so it cannot be reset by switching linked addresses.
    mapping(bytes32 => TokenBucket.Bucket) public statementBuckets;

    // Membership criteria
    string public nationality;

    event StatementAdded(uint indexed id, string statement);
    event StatementRankChanged(
        uint indexed statementId,
        int previousRank,
        int newRank
    );
    event StatementEngaged(uint indexed statementId);

    constructor(
        ASymvoliaRegistry _symvoliaRegistry,
        string memory _nationality,
        ForumConfig memory _config
    ) {
        symvoliaRegistry = _symvoliaRegistry;
        nationality = _nationality;
        maxRankedStatements = _config.maxRankedStatements;
        creditAllowanceIntervalSeconds = _config.creditAllowanceIntervalSeconds;
        engagementWindowSeconds = _config.engagementWindowSeconds;
        maxStatementLength = _config.maxStatementLength;
        userCreditAllowancePerInterval = _config.userCreditAllowancePerInterval;
        userStartingCredits = _config.userStartingCredits;
        minStatementSupportToRank = _config.minStatementSupportToRank;
        minAdjustmentIntervalSeconds = _config.minAdjustmentIntervalSeconds;
        creditMultiplier = _config.creditMultiplier;
        refundPenaltyBps = _config.refundPenaltyBps;
        decaySpeedupFactor = _config.decaySpeedupFactor > 0
            ? _config.decaySpeedupFactor
            : 1;
        statementBurstCapacity = _config.statementBurstCapacity;
        statementRefillIntervalSeconds = _config.statementRefillIntervalSeconds;
    }

    function _resolveStatement(
        uint _statementId
    ) internal view returns (Statement memory) {
        StatementImpl memory _statement = statements[_statementId];
        int currentSupport = _getCurrentSupportValue(_statement.support);
        int currentRank = _getStatementRank(_statement);
        return
            Statement({
                id: _statement.id,
                text: _statement.text,
                createdTimestamp: _statement.createdTimestamp,
                support: currentSupport,
                rank: currentRank,
                peakRank: _statement.peakRank
            });
    }

    function _getStatementRank(
        StatementImpl memory _statement
    ) internal view returns (int) {
        return _statement.rank < int(rankedCount) ? _statement.rank : -1;
    }

    function getRankedStatement(
        uint _rank
    ) external view returns (Statement memory) {
        if (_rank >= rankedCount) revert RankOutOfBounds(_rank, rankedCount);
        return _resolveStatement(statementRankings[_rank]);
    }

    function getRankedStatementsPage(
        uint _start,
        uint _limit
    ) external view returns (Statement[] memory) {
        if (_start > statementCount)
            revert StartOutOfBounds(_start, statementCount);

        uint _length = _start + _limit <= rankedCount
            ? _limit
            : rankedCount - _start;

        Statement[] memory rankedStatements = new Statement[](_length);
        for (uint i = 0; i < _length; i++) {
            rankedStatements[i] = _resolveStatement(
                statementRankings[_start + i]
            );
        }
        return rankedStatements;
    }

    function getStatementsById(
        uint[] calldata _statementIds
    ) external view returns (Statement[] memory) {
        Statement[] memory stmts = new Statement[](_statementIds.length);
        for (uint i = 0; i < _statementIds.length; i++) {
            uint stmtId = _statementIds[i];
            if (stmtId >= statementCount) revert InvalidStatementId(stmtId);
            stmts[i] = _resolveStatement(stmtId);
        }
        return stmts;
    }

    /// @notice Returns the support a statement needs to enter the ranked list.
    function getRankingThreshold() external view returns (int) {
        return _getRankingThreshold();
    }

    function isMember() public view returns (bool) {
        if (!symvoliaRegistry.isRegistered(msg.sender)) {
            return false;
        }
        if (bytes(nationality).length == 0) {
            return true;
        }
        Registration memory registration = symvoliaRegistry.getUserRegistration(
            msg.sender
        );
        return StringUtils.equals(registration.nationality, nationality);
    }

    modifier onlyMembers() {
        if (!isMember()) revert NotMember();
        _;
    }

    function _rankingMaintenance() internal {
        while (
            rankedCount > 0 &&
            _getCurrentSupportValue(
                statements[statementRankings[rankedCount - 1]].support
            ) <
                minStatementSupportToRank
        ) {
            rankedCount -= 1;
            _setStatementRank(statementRankings[rankedCount], -1);
        }
    }

    function _getRankingThreshold() internal view returns (int) {
        if (rankedCount < maxRankedStatements) {
            return minStatementSupportToRank;
        }
        uint _lowestRankedStatementId = statementRankings[rankedCount - 1];
        return
            _getCurrentSupportValue(
                statements[_lowestRankedStatementId].support
            ) + 1;
    }

    /// @dev Sets a statement's rank and updates peakRank if this is the best rank achieved.
    ///      Emits StatementRankChanged when the effective rank actually changes.
    function _setStatementRank(uint _statementId, int _rank) internal {
        int previousRank = statements[_statementId].rank;
        statements[_statementId].rank = _rank;

        if (previousRank != _rank) {
            emit StatementRankChanged(_statementId, previousRank, _rank);
        }
        if (
            _rank >= 0 &&
            (_rank < statements[_statementId].peakRank ||
                statements[_statementId].peakRank == -1)
        ) {
            statements[_statementId].peakRank = _rank;
        }
    }

    function _updateStatementRanking(uint _statementId) internal {
        _rankingMaintenance();
        StatementImpl memory statement = statements[_statementId];

        uint _rank;
        if (_getStatementRank(statement) != -1) {
            _rank = uint(statement.rank);
        } else {
            int _rankingThreshold = _getRankingThreshold();

            if (
                _getCurrentSupportValue(statement.support) < _rankingThreshold
            ) {
                return;
            }

            if (rankedCount < maxRankedStatements) {
                _rank = rankedCount;
                rankedCount += 1;
            } else {
                _rank = rankedCount - 1;
                // Mark the evicted statement as unranked
                _setStatementRank(statementRankings[_rank], -1);
            }

            if (statementRankings.length == _rank) {
                statementRankings.push();
            }
        }

        while (
            _rank >= 1 &&
            _getCurrentSupportValue(statement.support) >
                _getCurrentSupportValue(
                    statements[statementRankings[_rank - 1]].support
                )
        ) {
            statementRankings[_rank] = statementRankings[_rank - 1];
            _setStatementRank(statementRankings[_rank], int(_rank));
            _rank -= 1;
        }

        while (
            _rank + 1 < rankedCount &&
            _getCurrentSupportValue(statement.support) <
                _getCurrentSupportValue(
                    statements[statementRankings[_rank + 1]].support
                )
        ) {
            statementRankings[_rank] = statementRankings[_rank + 1];
            _setStatementRank(statementRankings[_rank], int(_rank));
            _rank += 1;
        }

        // If the statement's support has fallen below the ranking threshold,
        // unrank it and compact the array.
        if (
            _getCurrentSupportValue(statement.support) <
            minStatementSupportToRank
        ) {
            rankedCount -= 1;
            _setStatementRank(_statementId, -1);
            return;
        }

        statementRankings[_rank] = _statementId;
        _setStatementRank(_statementId, int(_rank));
    }

    function addStatement(
        string calldata _statementText,
        int _initialSupport
    ) external onlyMembers returns (uint) {
        if (bytes(_statementText).length == 0) revert EmptyStatement();
        if (bytes(_statementText).length > maxStatementLength)
            revert StatementTooLong(
                bytes(_statementText).length,
                maxStatementLength
            );

        // Rate-limit statement creation per registered identity (token bucket).
        // `onlyMembers` guarantees the caller is registered, and
        // `getUserIdentifier` reverts otherwise.
        bytes32 _userId = symvoliaRegistry.getUserIdentifier(msg.sender);
        _consumeStatementToken(_userId);

        statements[statementCount] = StatementImpl({
            id: statementCount,
            text: _statementText,
            createdTimestamp: block.timestamp,
            support: Support({value: 0, lastUpdated: block.timestamp}),
            rank: -1,
            peakRank: -1,
            lastEngagementEventTimestamp: 0
        });

        // Bring the caller's credit balance current on every statement
        // addition (not only when initial support is set) so that
        // `userCredits[_userId].lastUpdated` always advances. Clients rely on
        // that timestamp to detect that on-chain state changed for this user.
        UserBalance storage _userBalance = userCredits[_userId];
        _updateUserBalanceToBeCurrent(_userBalance);

        if (_initialSupport != 0) {
            // Apply initial support to statement and user support map
            statements[statementCount].support.value = _initialSupport;
            userSupportMap[_userId][statementCount] = Support({
                value: _initialSupport,
                lastUpdated: block.timestamp
            });
            _updateUserSupportedStatements(_userId, statementCount);

            // Charge credits (old cost is 0 since this is a new statement)
            uint _cost = _costOfUserSupport(_initialSupport);
            if (_userBalance.credits < _cost)
                revert InsufficientCredits(_userBalance.credits, int(_cost));
            _userBalance.credits -= _cost;
        }

        _updateStatementRanking(statementCount);
        emit StatementAdded(statementCount, _statementText);
        uint _id = statementCount;
        statementCount++;
        return _id;
    }

    /**
     * @notice Spends one statement-creation token for `_userId`, reverting when
     *         the user's token bucket is empty.
     * @dev Brings the bucket current (refilling one token per
     *      `statementRefillIntervalSeconds`, capped at `statementBurstCapacity`)
     *      and persists the decremented state. See {TokenBucket}.
     * @param _userId The registered identity spending the token.
     */
    function _consumeStatementToken(bytes32 _userId) private {
        TokenBucket.Bucket storage _bucket = statementBuckets[_userId];
        (uint _tokens, uint _lastRefill) = TokenBucket.refresh(
            _bucket.tokens,
            _bucket.lastRefill,
            statementBurstCapacity,
            statementRefillIntervalSeconds,
            block.timestamp
        );

        if (_tokens == 0)
            revert StatementRateLimited(
                _lastRefill + statementRefillIntervalSeconds
            );

        _bucket.tokens = _tokens - 1;
        _bucket.lastRefill = _lastRefill;
    }

    /**
     * @notice The caller's current statement-creation allowance.
     * @return available The number of statements the caller can create right
     *         now (up to `statementBurstCapacity`).
     * @return nextRefillTimestamp When the next token is regained, or 0 when the
     *         bucket is already full.
     */
    function getStatementAllowance()
        external
        view
        onlyMembers
        returns (uint available, uint nextRefillTimestamp)
    {
        bytes32 _userId = symvoliaRegistry.getUserIdentifier(msg.sender);
        TokenBucket.Bucket memory _bucket = statementBuckets[_userId];
        (uint _tokens, uint _lastRefill) = TokenBucket.refresh(
            _bucket.tokens,
            _bucket.lastRefill,
            statementBurstCapacity,
            statementRefillIntervalSeconds,
            block.timestamp
        );
        available = _tokens;
        nextRefillTimestamp = _tokens >= statementBurstCapacity
            ? 0
            : _lastRefill + statementRefillIntervalSeconds;
    }

    function getUserBalance() external view onlyMembers returns (uint) {
        bytes32 userId = symvoliaRegistry.getUserIdentifier(msg.sender);
        UserBalance memory _balance = userCredits[userId];
        return _getCurrentUserBalance(_balance);
    }

    /**
     * @notice Timestamp of the caller's most recent credit-affecting action.
     * @dev Returns the raw stored `lastUpdated`, which is 0 until the user's
     * first action and is then set to `block.timestamp` (strictly increasing)
     * on every `addStatement` and `adjustSupport` via
     * `_updateUserBalanceToBeCurrent`. Clients use it to detect that on-chain
     * state changed for this user (e.g. to reconcile locally staged changes).
     */
    function getUserLastUpdated() external view onlyMembers returns (uint) {
        bytes32 userId = symvoliaRegistry.getUserIdentifier(msg.sender);
        return userCredits[userId].lastUpdated;
    }

    function getUserStatementSupport()
        external
        view
        onlyMembers
        returns (StatementSupport[] memory)
    {
        bytes32 userId = symvoliaRegistry.getUserIdentifier(msg.sender);

        uint _numSupported = 0;
        for (uint i = 0; i < _userSupportedStatements[userId].length; i++) {
            uint statementId = _userSupportedStatements[userId][i];
            Support storage support = userSupportMap[userId][statementId];
            if (_getCurrentSupportValue(support) != 0) {
                _numSupported++;
            }
        }

        StatementSupport[] memory supportedStatements = new StatementSupport[](
            _numSupported
        );
        uint j = 0;
        for (uint i = 0; i < _userSupportedStatements[userId].length; i++) {
            uint statementId = _userSupportedStatements[userId][i];
            Support storage support = userSupportMap[userId][statementId];
            int currentSupport = _getCurrentSupportValue(support);
            if (currentSupport != 0) {
                supportedStatements[j++] = StatementSupport({
                    statementId: statementId,
                    support: currentSupport
                });
            }
        }
        return supportedStatements;
    }

    // ======================================================================
    // Decay and credit allowance
    // ======================================================================

    function _decayValue(
        int startValue,
        uint fromTimestamp,
        uint toTimestamp
    ) internal view returns (int) {
        if (fromTimestamp > toTimestamp)
            revert TimestampOrderInvalid(fromTimestamp, toTimestamp);

        uint elapsedSeconds = (toTimestamp - fromTimestamp) *
            decaySpeedupFactor;

        if (startValue == 0 || elapsedSeconds == 0) {
            return startValue;
        }

        return DecayUtils.approxDecay(startValue, elapsedSeconds);
    }

    function _getCurrentUserBalance(
        UserBalance memory _balance
    ) internal view returns (uint) {
        if (_balance.lastUpdated == 0) {
            _balance.credits = userStartingCredits;
            _balance.lastUpdated = symvoliaRegistry
                .getUserRegistration(msg.sender)
                .registrationTimestamp;
        }

        uint elapsedSeconds = block.timestamp - _balance.lastUpdated;
        uint elapsedIntervals = elapsedSeconds / creditAllowanceIntervalSeconds;
        return
            _balance.credits +
            (elapsedIntervals * userCreditAllowancePerInterval);
    }

    function _updateUserBalanceToBeCurrent(
        UserBalance storage _balance
    ) internal {
        _balance.credits = _getCurrentUserBalance(_balance);
        _balance.lastUpdated = block.timestamp;
    }

    function _getCurrentSupportValue(
        Support memory _support
    ) internal view returns (int) {
        return
            _decayValue(_support.value, _support.lastUpdated, block.timestamp);
    }

    function _updateSupportToBeCurrent(Support storage _support) internal {
        _support.value = _decayValue(
            _support.value,
            _support.lastUpdated,
            block.timestamp
        );
        _support.lastUpdated = block.timestamp;
    }

    function _costOfUserSupport(int _userSupport) internal view returns (uint) {
        uint absSupport = uint(
            _userSupport >= 0 ? _userSupport : -_userSupport
        );
        return
            (absSupport * (absSupport + creditMultiplier)) /
            (2 * creditMultiplier);
    }

    function _updateUserSupportedStatements(
        bytes32 _userId,
        uint _statementId
    ) internal {
        int _firstEmptySlot = -1;
        int _secondEmptySlot = -1;
        int _lastOccupiedSlot = -1;
        bool _statementAlreadyTracked = false;
        for (uint i = 0; i < _userSupportedStatements[_userId].length; i++) {
            uint _currStatementId = _userSupportedStatements[_userId][i];
            if (_currStatementId == _statementId) {
                _statementAlreadyTracked = true;
            }
            if (
                _getCurrentSupportValue(
                    userSupportMap[_userId][_currStatementId]
                ) == 0
            ) {
                if (_firstEmptySlot == -1) {
                    _firstEmptySlot = int(i);
                } else if (_secondEmptySlot == -1) {
                    _secondEmptySlot = int(i);
                }
            } else {
                _lastOccupiedSlot = int(i);
            }
        }

        if (
            !_statementAlreadyTracked &&
            _getCurrentSupportValue(userSupportMap[_userId][_statementId]) != 0
        ) {
            if (_firstEmptySlot == -1) {
                // no empty slots, just append
                _userSupportedStatements[_userId].push(_statementId);
            } else {
                _userSupportedStatements[_userId][
                    uint(_firstEmptySlot)
                ] = _statementId;
            }
        }

        if (
            _secondEmptySlot != -1 &&
            _lastOccupiedSlot != -1 &&
            _lastOccupiedSlot > _secondEmptySlot
        ) {
            _userSupportedStatements[_userId][
                uint(_secondEmptySlot)
            ] = _userSupportedStatements[_userId][uint(_lastOccupiedSlot)];
            _userSupportedStatements[_userId].pop();
        }
    }

    function adjustSupport(
        SupportAdjustment[] calldata _supportAdjustments
    ) external onlyMembers {
        if (!symvoliaRegistry.isRegistered(msg.sender))
            revert UserNotRegistered(msg.sender);
        bytes32 _userId = symvoliaRegistry.getUserIdentifier(msg.sender);

        UserBalance storage _userBalance = userCredits[_userId];
        _updateUserBalanceToBeCurrent(_userBalance);

        int _totalCostChange = 0;

        for (uint i = 0; i < _supportAdjustments.length; i++) {
            SupportAdjustment memory _adjustment = _supportAdjustments[i];
            if (_adjustment.statementId >= statementCount)
                revert InvalidStatementId(_adjustment.statementId);

            Support storage _currentStatementSupport = statements[
                _adjustment.statementId
            ].support;
            Support storage _currentUserSupport = userSupportMap[_userId][
                _adjustment.statementId
            ];

            // Prevent rapid-fire adjustments to the same statement
            if (
                block.timestamp - _currentUserSupport.lastUpdated <
                minAdjustmentIntervalSeconds
            ) revert DuplicateAdjustment(_adjustment.statementId);

            _updateSupportToBeCurrent(_currentStatementSupport);
            _updateSupportToBeCurrent(_currentUserSupport);

            int _oldSupport = _currentUserSupport.value;
            int _newSupport = _adjustment.adjustmentType ==
                SupportAdjustmentType.SetTo
                ? _adjustment.value
                : _oldSupport + _adjustment.value;
            int _supportChange = _newSupport - _oldSupport;

            uint _oldCost = _costOfUserSupport(_oldSupport);
            uint _newCost = _costOfUserSupport(_newSupport);
            _totalCostChange += int(_newCost) - int(_oldCost);

            _currentStatementSupport.value += _supportChange;
            _currentUserSupport.value = _newSupport;

            _updateUserSupportedStatements(_userId, _adjustment.statementId);

            _updateStatementRanking(_adjustment.statementId);

            // Emit engagement event if enough time has passed since the last one
            if (
                block.timestamp >=
                statements[_adjustment.statementId]
                    .lastEngagementEventTimestamp +
                    engagementWindowSeconds
            ) {
                statements[_adjustment.statementId]
                    .lastEngagementEventTimestamp = block.timestamp;
                emit StatementEngaged(_adjustment.statementId);
            }
        }

        // Apply refund penalty when net cost change is negative (user receives credits back)
        if (_totalCostChange < 0) {
            uint _refund = uint(-_totalCostChange);
            uint _penalty = (_refund * refundPenaltyBps) / 10000;
            _totalCostChange = -int(_refund - _penalty);
        }

        if (int(_userBalance.credits) < _totalCostChange)
            revert InsufficientCredits(_userBalance.credits, _totalCostChange);
        _userBalance.credits = uint(
            int(_userBalance.credits) - _totalCostChange
        );
    }
}
