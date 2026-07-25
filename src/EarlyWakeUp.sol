// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract EarlyWakeUp {
    address public owner;

    uint256 public score;
    uint256 public target;
    uint256 public lastCheckIn;

    uint256 public constant UTC8_OFFSET = 8 hours;

    // 5:30 = 19800, 6:30 = 23400, 7:00 = 25200, 7:30 = 27000, 8:00 = 28800, 8:30 = 30600
    uint256 private constant START_100 = 5 hours + 30 minutes;
    uint256 private constant START_80 = 6 hours + 30 minutes;
    uint256 private constant START_60 = 7 hours;
    uint256 private constant START_40 = 7 hours + 30 minutes;
    uint256 private constant START_20 = 8 hours;
    uint256 private constant END_20 = 8 hours + 30 minutes;
    uint256 private constant DAY = 1 days;
    uint256 private constant RESET_THRESHOLD = 80;

    event TargetSet(uint256 target);
    event Donated(address indexed donor, uint256 amount);
    event CheckedIn(uint256 indexed day, uint256 points, uint256 score);
    event Withdrawn(address indexed owner, uint256 amount, uint256 score);

    error NotOwner();
    error TargetNotSet();
    error AlreadyCheckedInToday();
    error NotInCheckInWindow();
    error NothingToWithdraw();
    error TransferFailed();
    error InvalidTarget();
    error CycleInProgress();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(uint256 _target) {
        owner = msg.sender;
        if (_target == 0) revert InvalidTarget();
        target = _target;
        emit TargetSet(_target);
    }

    function setTarget(uint256 _target) external onlyOwner {
        if (_target == 0) revert InvalidTarget();
        // 只有当前 score 为 0 时才能改目标，防止中途篡改目标
        if (score > 0) revert CycleInProgress();

        target = _target;
        lastCheckIn = 0;
        emit TargetSet(_target);
    }

    function donate() external payable {
        emit Donated(msg.sender, msg.value);
    }

    receive() external payable {
        emit Donated(msg.sender, msg.value);
    }

    function checkIn() external onlyOwner {
        uint256 todayDay = _toDay(block.timestamp);
        if (lastCheckIn != 0 && todayDay <= _toDay(lastCheckIn)) {
            revert AlreadyCheckedInToday();
        }

        uint256 todayPoints = _pointsForTimeOfDay(_timeOfDay(block.timestamp));
        if (todayPoints == 0) revert NotInCheckInWindow();

        if (score > 0) {
            uint256 lastDay = _toDay(lastCheckIn);
            uint256 missed = todayDay - lastDay - 1;
            uint256 penalized = _applyPenalty(score, missed);

            if (penalized < RESET_THRESHOLD) {
                score = 0;
            } else {
                score = penalized + todayPoints;
            }
        } else {
            score = todayPoints;
        }

        lastCheckIn = block.timestamp;
        emit CheckedIn(todayDay, todayPoints, score);
    }

    function withdraw() external onlyOwner {
        if (target == 0) revert TargetNotSet();
        if (score == 0) revert NothingToWithdraw();

        uint256 effectiveScore = score > target ? target : score;
        uint256 amount = address(this).balance * effectiveScore / target;
        if (amount == 0) revert NothingToWithdraw();

        (bool success, ) = payable(owner).call{value: amount}("");
        if (!success) revert TransferFailed();

        score = 0;
        emit Withdrawn(owner, amount, effectiveScore);
    }

    function _toDay(uint256 timestamp) internal pure returns (uint256) {
        return (timestamp + UTC8_OFFSET) / DAY;
    }

    function _timeOfDay(uint256 timestamp) internal pure returns (uint256) {
        return (timestamp + UTC8_OFFSET) % DAY;
    }

    function _pointsForTimeOfDay(uint256 timeOfDay) internal pure returns (uint256) {
        if (timeOfDay >= START_100 && timeOfDay < START_80) return 100;
        if (timeOfDay >= START_80 && timeOfDay < START_60) return 80;
        if (timeOfDay >= START_60 && timeOfDay < START_40) return 60;
        if (timeOfDay >= START_40 && timeOfDay < START_20) return 40;
        if (timeOfDay >= START_20 && timeOfDay < END_20) return 20;
        return 0;
    }

    // 用逐步 floor(score * 4 / 5) 实现 0.8^N 的折扣。
    // 与严格的一次性 floor(score * 0.8^N) 在 N 较大时可能有 1~2 分整数误差，但避免溢出且燃气更省。
    function _applyPenalty(uint256 _score, uint256 _missedDays) internal pure returns (uint256) {
        uint256 current = _score;
        for (uint256 i = 0; i < _missedDays; i++) {
            current = current * 4 / 5;
            if (current == 0) break;
        }
        return current;
    }

    // View helpers
    function currentDay() external view returns (uint256) {
        return _toDay(block.timestamp);
    }

    function currentTimeOfDay() external view returns (uint256) {
        return _timeOfDay(block.timestamp);
    }

    function currentPoints() external view returns (uint256) {
        return _pointsForTimeOfDay(_timeOfDay(block.timestamp));
    }

    function missedDays() external view returns (uint256) {
        if (lastCheckIn == 0) return 0;
        uint256 todayDay = _toDay(block.timestamp);
        uint256 lastDay = _toDay(lastCheckIn);
        if (todayDay <= lastDay) return 0;
        return todayDay - lastDay - 1;
    }

    function penalizedScore() external view returns (uint256) {
        if (score == 0 || lastCheckIn == 0) return score;
        uint256 todayDay = _toDay(block.timestamp);
        uint256 lastDay = _toDay(lastCheckIn);
        if (todayDay <= lastDay) return score;
        return _applyPenalty(score, todayDay - lastDay - 1);
    }

    function claimableReward() external view returns (uint256) {
        if (target == 0 || score == 0) return 0;
        uint256 effectiveScore = score > target ? target : score;
        return address(this).balance * effectiveScore / target;
    }
}
