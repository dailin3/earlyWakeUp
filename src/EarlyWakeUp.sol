// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract EarlyWakeUp {
    address public owner;

    uint256 public score;
    uint256 public target;
    uint256 public cooldown;        // 每个周期需要等待的秒数
    uint256 public cooldownStart;   // 当前周期第一次签到时间，0 表示尚未开始周期
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

    event TargetSet(uint256 target, uint256 cooldown);
    event Donated(address indexed donor, uint256 amount);
    event CheckedIn(uint256 indexed day, uint256 points, uint256 score);
    event Withdrawn(address indexed owner, uint256 amount, uint256 score);

    error NotOwner();
    error TargetNotSet();
    error CooldownNotOver();
    error AlreadyCheckedInToday();
    error NotInCheckInWindow();
    error NothingToWithdraw();
    error TransferFailed();
    error InvalidTarget();
    error InvalidCooldown();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(uint256 _target, uint256 _cooldown) {
        owner = msg.sender;
        if (_target == 0) revert InvalidTarget();
        if (_cooldown == 0) revert InvalidCooldown();
        target = _target;
        cooldown = _cooldown;
        // cooldownStart 保持为 0，表示周期尚未开始
        emit TargetSet(_target, _cooldown);
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
                // 漏签导致重置：score 归零，但不刷新冷却
                score = 0;
            } else {
                score = penalized + todayPoints;
            }
        }

        // 从 score == 0 开始签到，视为新周期开始，刷新冷却起点
        if (score == 0) {
            score = todayPoints;
            cooldownStart = block.timestamp;
        }

        lastCheckIn = block.timestamp;
        emit CheckedIn(todayDay, todayPoints, score);
    }

    function withdraw() external onlyOwner {
        if (target == 0) revert TargetNotSet();
        if (score == 0) revert NothingToWithdraw();
        if (cooldownStart == 0) revert CooldownNotOver();
        if (block.timestamp < cooldownStart + cooldown) revert CooldownNotOver();

        // 先用当前时间重新计算漏签惩罚，防止靠“停止打卡”锁定最高分
        uint256 todayDay = _toDay(block.timestamp);
        uint256 lastDay = _toDay(lastCheckIn);
        uint256 missed = todayDay > lastDay ? todayDay - lastDay - 1 : 0;
        uint256 currentScore = score;

        if (missed > 0) {
            currentScore = _applyPenalty(score, missed);
            // 漏签惩罚后 score < 80，不满足提取条件，直接 revert
            if (currentScore < RESET_THRESHOLD) revert NothingToWithdraw();
        }

        uint256 effectiveScore = currentScore > target ? target : currentScore;
        uint256 amount = address(this).balance * effectiveScore / target;
        if (amount == 0) revert NothingToWithdraw();

        // CEI：先改状态，再做外部转账
        score = 0;
        // 注意：提款成功不刷新 cooldownStart，下一周期从 score=0 的第一次签到开始

        (bool success, ) = payable(owner).call{value: amount}("");
        if (!success) revert TransferFailed();

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
        if (cooldownStart == 0) return 0;
        if (block.timestamp < cooldownStart + cooldown) return 0;
        uint256 todayDay = _toDay(block.timestamp);
        uint256 lastDay = _toDay(lastCheckIn);
        uint256 missed = todayDay > lastDay ? todayDay - lastDay - 1 : 0;
        uint256 currentScore = missed > 0 ? _applyPenalty(score, missed) : score;
        if (currentScore < RESET_THRESHOLD) return 0;
        uint256 effectiveScore = currentScore > target ? target : currentScore;
        return address(this).balance * effectiveScore / target;
    }
}
