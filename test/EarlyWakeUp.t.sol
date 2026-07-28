// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {EarlyWakeUp} from "../src/EarlyWakeUp.sol";

contract EarlyWakeUpTest is Test {
    EarlyWakeUp public game;

    address public owner = address(0x1);
    address public donor = address(0x2);

    // 2024-01-01 00:00:00 UTC+8 = 1704038400 UTC
    uint256 public constant JAN1_UTC8 = 1704038400;
    uint256 public constant DAY = 1 days;
    uint256 public constant SIX_AM = 6 hours;
    uint256 public constant COOLDOWN = 7 days;

    function setUp() public {
        vm.warp(JAN1_UTC8);
        vm.prank(owner);
        game = new EarlyWakeUp(1000, COOLDOWN);
    }

    function _warpToDay(uint256 dayOffset) internal {
        vm.warp(JAN1_UTC8 + dayOffset * DAY + SIX_AM);
    }

    function _checkInDays(uint256 startDay, uint256 count) internal {
        for (uint256 i = 0; i < count; i++) {
            _warpToDay(startDay + i);
            vm.prank(owner);
            game.checkIn();
        }
    }

    function test_InitialState() public view {
        assertEq(game.owner(), owner);
        assertEq(game.target(), 1000);
        assertEq(game.cooldown(), COOLDOWN);
        assertEq(game.score(), 0);
        assertEq(game.cooldownStart(), 0);
        assertEq(game.lastCheckIn(), 0);
    }

    function test_ConstructorZeroTargetReverts() public {
        vm.prank(owner);
        vm.expectRevert(EarlyWakeUp.InvalidTarget.selector);
        new EarlyWakeUp(0, COOLDOWN);
    }

    function test_ConstructorZeroCooldownReverts() public {
        vm.prank(owner);
        vm.expectRevert(EarlyWakeUp.InvalidCooldown.selector);
        new EarlyWakeUp(1000, 0);
    }

    function test_DonateIncreasesBalance() public {
        hoax(donor, 1 ether);
        game.donate{value: 0.5 ether}();
        assertEq(address(game).balance, 0.5 ether);
    }

    function test_ReceiveDonation() public {
        hoax(donor, 1 ether);
        (bool success,) = address(game).call{value: 0.3 ether}("");
        assertTrue(success);
        assertEq(address(game).balance, 0.3 ether);
    }

    function test_FirstCheckInSetsCooldownStart() public {
        _warpToDay(0);
        vm.prank(owner);
        game.checkIn();
        assertEq(game.score(), 100);
        assertEq(game.cooldownStart(), JAN1_UTC8 + SIX_AM);
        assertEq(game.lastCheckIn(), JAN1_UTC8 + SIX_AM);
    }

    function test_CheckInBoundary630() public {
        vm.warp(JAN1_UTC8 + 6 hours + 30 minutes);
        vm.prank(owner);
        game.checkIn();
        assertEq(game.score(), 80);
    }

    function test_CheckInAllWindows() public {
        uint256[2][5] memory cases = [
            [JAN1_UTC8 + 5 hours + 30 minutes, uint256(100)],
            [JAN1_UTC8 + 6 hours + 30 minutes, uint256(80)],
            [JAN1_UTC8 + 7 hours, uint256(60)],
            [JAN1_UTC8 + 7 hours + 30 minutes, uint256(40)],
            [JAN1_UTC8 + 8 hours, uint256(20)]
        ];

        uint256 expectedScore = 0;
        for (uint256 i = 0; i < 5; i++) {
            uint256 timestamp = cases[i][0] + i * DAY;
            vm.warp(timestamp);
            vm.prank(owner);
            game.checkIn();
            expectedScore += cases[i][1];
            assertEq(game.score(), expectedScore);
        }
    }

    function test_CheckInOutsideWindowReverts() public {
        vm.warp(JAN1_UTC8 + 9 hours);
        vm.prank(owner);
        vm.expectRevert(EarlyWakeUp.NotInCheckInWindow.selector);
        game.checkIn();
    }

    function test_CheckInTwiceSameDayReverts() public {
        _warpToDay(0);
        vm.prank(owner);
        game.checkIn();

        vm.warp(JAN1_UTC8 + 7 hours);
        vm.prank(owner);
        vm.expectRevert(EarlyWakeUp.AlreadyCheckedInToday.selector);
        game.checkIn();
    }

    function test_OnlyOwnerCanCheckIn() public {
        _warpToDay(0);
        vm.prank(donor);
        vm.expectRevert(EarlyWakeUp.NotOwner.selector);
        game.checkIn();
    }

    function test_OnlyOwnerCanWithdraw() public {
        _checkInDays(0, 7);
        vm.prank(donor);
        vm.expectRevert(EarlyWakeUp.NotOwner.selector);
        game.withdraw();
    }

    function test_WithdrawBeforeAnyCheckInReverts() public {
        _warpToDay(7);
        vm.prank(owner);
        vm.expectRevert(EarlyWakeUp.NothingToWithdraw.selector);
        game.withdraw();
    }

    function test_WithdrawDuringCooldownReverts() public {
        _checkInDays(0, 1);

        _warpToDay(1);
        vm.prank(owner);
        vm.expectRevert(EarlyWakeUp.CooldownNotOver.selector);
        game.withdraw();
    }

    function test_OneMissedDayPenalty() public {
        _checkInDays(0, 1);
        assertEq(game.score(), 100);

        _warpToDay(2);
        vm.prank(owner);
        game.checkIn();
        assertEq(game.score(), 180);
    }

    function test_TwoMissedDaysPenalty() public {
        _checkInDays(0, 1);
        assertEq(game.score(), 100);

        _warpToDay(3);
        vm.prank(owner);
        game.checkIn();
        // 漏签 2 天触发重置，同一笔 checkIn 立即开启新周期，score 为当日 100 分
        assertEq(game.score(), 100);
    }

    function test_ResetThenContinue() public {
        _checkInDays(0, 1);

        _warpToDay(3);
        vm.prank(owner);
        game.checkIn();
        // 漏签 2 天触发重置，同一笔 checkIn 立即开启新周期
        assertEq(game.score(), 100);
        assertEq(game.cooldownStart(), JAN1_UTC8 + 3 * DAY + SIX_AM);

        // 从第 4 天继续签到，累积到新周期
        _warpToDay(4);
        vm.prank(owner);
        game.checkIn();
        assertEq(game.score(), 200);
        // 冷却起点仍保持为第 3 天
        assertEq(game.cooldownStart(), JAN1_UTC8 + 3 * DAY + SIX_AM);
    }

    function test_HighScoreResetsAfterManyMissedDays() public {
        _checkInDays(0, 10);
        assertEq(game.score(), 1000);

        // 第 21 天签到，漏签 10 天 -> 1000 -> 105 -> +100 = 205
        _warpToDay(20);
        vm.prank(owner);
        game.checkIn();
        assertEq(game.score(), 205);
    }

    function test_WithdrawAfterCooldown() public {
        // 第 0-6 天连续签到 7 天，score = 700
        _checkInDays(0, 7);
        assertEq(game.score(), 700);

        vm.deal(address(game), 1 ether);
        // 第 7 天冷却结束，提取 70%
        _warpToDay(7);

        uint256 ownerBalanceBefore = owner.balance;
        vm.prank(owner);
        game.withdraw();
        uint256 ownerBalanceAfter = owner.balance;

        assertEq(ownerBalanceAfter - ownerBalanceBefore, 0.7 ether);
        assertEq(game.score(), 0);
        // 提款不刷新冷却起点，cooldownStart 仍保持第 0 天
        assertEq(game.cooldownStart(), JAN1_UTC8 + SIX_AM);
    }

    function test_WithdrawAppliesMissedDaysPenalty() public {
        // 第 0-6 天签到，score = 700
        _checkInDays(0, 7);

        vm.deal(address(game), 1 ether);
        // 第 14 天提取（冷却已结束），漏签 6 天 -> 700 -> 182 -> 提取 18.2%
        _warpToDay(13);

        uint256 ownerBalanceBefore = owner.balance;
        vm.prank(owner);
        game.withdraw();
        uint256 ownerBalanceAfter = owner.balance;

        assertEq(ownerBalanceAfter - ownerBalanceBefore, 0.182 ether);
        assertEq(game.score(), 0);
    }

    function test_WithdrawResetByAbsenceReverts() public {
        _checkInDays(0, 10);
        assertEq(game.score(), 1000);

        vm.deal(address(game), 1 ether);
        // 第 20 天提取，漏签 9 天 -> 1000 -> 134，仍可提
        _warpToDay(19);
        vm.prank(owner);
        game.withdraw();
        assertEq(game.score(), 0);

        // 第 21 天尝试再提，但 score 已归零，revert
        _warpToDay(21);
        vm.prank(owner);
        vm.expectRevert(EarlyWakeUp.NothingToWithdraw.selector);
        game.withdraw();
    }

    function test_CannotWithdrawAgainWithinCooldown() public {
        _checkInDays(0, 7);
        vm.deal(address(game), 2 ether);

        _warpToDay(7);
        vm.prank(owner);
        game.withdraw();
        assertEq(game.score(), 0);

        // 提款后立刻再签到，开启新周期；但新周期冷却还没结束
        _warpToDay(8);
        vm.prank(owner);
        game.checkIn();

        _warpToDay(8);
        vm.prank(owner);
        vm.expectRevert(EarlyWakeUp.CooldownNotOver.selector);
        game.withdraw();
    }

    function test_SecondCycleAfterCooldown() public {
        _checkInDays(0, 7);
        vm.deal(address(game), 1 ether);

        _warpToDay(7);
        vm.prank(owner);
        game.withdraw();
        assertEq(address(game).balance, 0.3 ether);

        // 新周期：第 14 天开始重新签到
        _checkInDays(14, 7);
        vm.deal(address(game), 1.3 ether); // 再捐 1 ether

        _warpToDay(21);
        uint256 ownerBalanceBefore = owner.balance;
        vm.prank(owner);
        game.withdraw();
        uint256 ownerBalanceAfter = owner.balance;

        // 当前余额 1.3 ether，score = 700，提取 70% = 0.91 ether
        assertEq(ownerBalanceAfter - ownerBalanceBefore, 0.91 ether);
        assertEq(game.score(), 0);
    }

    function test_WithdrawCappedAt100Percent() public {
        _checkInDays(0, 12);
        assertEq(game.score(), 1200);

        vm.deal(address(game), 2 ether);
        _warpToDay(7); // 冷却结束

        uint256 ownerBalanceBefore = owner.balance;
        vm.prank(owner);
        game.withdraw();
        uint256 ownerBalanceAfter = owner.balance;

        assertEq(ownerBalanceAfter - ownerBalanceBefore, 2 ether);
        assertEq(game.score(), 0);
    }

    function test_WithdrawKeepsRemainingPool() public {
        _checkInDays(0, 5);
        assertEq(game.score(), 500);

        vm.deal(address(game), 1 ether);
        // 第 7 天提取，距上次签到（第 4 天）漏签 2 天 -> 500 -> 320 -> 提取 32%
        _warpToDay(7);

        vm.prank(owner);
        game.withdraw();
        assertEq(address(game).balance, 0.68 ether);
        assertEq(game.score(), 0);
    }

    function test_ClaimableRewardView() public {
        _checkInDays(0, 7); // days 0-6, score=700
        assertEq(game.score(), 700);

        vm.deal(address(game), 1 ether);
        _warpToDay(6); // 冷却未结束
        assertEq(game.claimableReward(), 0);

        _warpToDay(7); // 冷却结束，无漏签
        assertEq(game.claimableReward(), 0.7 ether);
    }

    function test_MissedDaysView() public {
        _warpToDay(0);
        vm.prank(owner);
        game.checkIn();

        _warpToDay(4);
        assertEq(game.missedDays(), 3);
    }

    function test_PenalizedScoreView() public view {
        assertEq(game.penalizedScore(), 0);
    }

    function test_NothingToWithdrawReverts() public {
        _checkInDays(0, 7);
        vm.deal(address(game), 1 ether);
        _warpToDay(7);
        vm.prank(owner);
        game.withdraw();
        assertEq(game.score(), 0);

        // score 已归零，再次提款失败
        vm.prank(owner);
        vm.expectRevert(EarlyWakeUp.NothingToWithdraw.selector);
        game.withdraw();
    }

    function test_FailureStartsNewCycleOnNextCheckIn() public {
        _checkInDays(0, 5);
        assertEq(game.score(), 500);
        assertEq(game.cooldownStart(), JAN1_UTC8 + SIX_AM);

        // 漏签导致 reset，同一笔 checkIn 会立即从 score=0 开启新周期
        _warpToDay(14);
        vm.prank(owner);
        game.checkIn();
        assertEq(game.score(), 100);
        assertEq(game.cooldownStart(), JAN1_UTC8 + 14 * DAY + SIX_AM);

        // 继续签到累积新周期分数，冷却起点不变
        _warpToDay(15);
        vm.prank(owner);
        game.checkIn();
        assertEq(game.score(), 200);
        assertEq(game.cooldownStart(), JAN1_UTC8 + 14 * DAY + SIX_AM);
    }

    function test_WithdrawAfterFailureNeedsNewCycle() public {
        _checkInDays(0, 5);
        assertEq(game.score(), 500);

        // 漏签导致 reset，同一笔 checkIn 立即开启新周期
        _warpToDay(14);
        vm.prank(owner);
        game.checkIn();
        assertEq(game.score(), 100);
        assertEq(game.cooldownStart(), JAN1_UTC8 + 14 * DAY + SIX_AM);

        vm.deal(address(game), 1 ether);

        // 新周期冷却未结束，不能提款
        _warpToDay(15);
        vm.prank(owner);
        vm.expectRevert(EarlyWakeUp.CooldownNotOver.selector);
        game.withdraw();

        // 继续签到把分数攒到 700
        _checkInDays(15, 6); // days 15-20
        assertEq(game.score(), 700);

        // 第 21 天新周期冷却结束，提取 70%
        _warpToDay(21);
        uint256 ownerBalanceBefore = owner.balance;
        vm.prank(owner);
        game.withdraw();
        uint256 ownerBalanceAfter = owner.balance;

        assertEq(ownerBalanceAfter - ownerBalanceBefore, 0.7 ether);
        assertEq(game.score(), 0);
    }
}
