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

    function setUp() public {
        vm.prank(owner);
        game = new EarlyWakeUp(1000, JAN1_UTC8 + 30 days);
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
        assertEq(game.targetTime(), JAN1_UTC8 + 30 days);
        assertEq(game.score(), 0);
        assertEq(game.lastCheckIn(), 0);
    }

    function test_DonateIncreasesBalance() public {
        hoax(donor, 1 ether);
        game.donate{value: 0.5 ether}();
        assertEq(address(game).balance, 0.5 ether);
    }

    function test_ReceiveDonation() public {
        hoax(donor, 1 ether);
        (bool success, ) = address(game).call{value: 0.3 ether}("");
        assertTrue(success);
        assertEq(address(game).balance, 0.3 ether);
    }

    function test_CheckIn100Points() public {
        _warpToDay(0);
        vm.prank(owner);
        game.checkIn();
        assertEq(game.score(), 100);
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
        _warpToDay(30);
        vm.prank(donor);
        vm.expectRevert(EarlyWakeUp.NotOwner.selector);
        game.withdraw();
    }

    function test_WithdrawBeforeTargetTimeReverts() public {
        _warpToDay(1);
        vm.prank(owner);
        vm.expectRevert(EarlyWakeUp.TargetTimeNotReached.selector);
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
        assertEq(game.score(), 0);
    }

    function test_ResetThenContinue() public {
        _checkInDays(0, 1);

        _warpToDay(3);
        vm.prank(owner);
        game.checkIn();
        assertEq(game.score(), 0);

        _warpToDay(4);
        vm.prank(owner);
        game.checkIn();
        assertEq(game.score(), 100);
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

    function test_WithdrawAppliesMissedDaysPenalty() public {
        // 第 21-30 天连续签到 10 天，score = 1000，lastCheckIn = day 30
        _checkInDays(20, 10);
        assertEq(game.score(), 1000);

        vm.deal(address(game), 1 ether);
        // 第 41 天提取，漏签 10 天 -> 1000 -> 105，可提取 10.5%
        _warpToDay(40);

        uint256 ownerBalanceBefore = owner.balance;
        vm.prank(owner);
        game.withdraw();
        uint256 ownerBalanceAfter = owner.balance;

        assertEq(ownerBalanceAfter - ownerBalanceBefore, 0.105 ether);
        assertEq(game.score(), 0);
    }

    function test_WithdrawResetByAbsenceReverts() public {
        _checkInDays(20, 10);
        assertEq(game.score(), 1000);

        vm.deal(address(game), 1 ether);
        // 第 51 天提取，漏签 20 天 -> 1000 -> 11 < 80，会触发重置并 revert
        _warpToDay(50);

        vm.prank(owner);
        vm.expectRevert(EarlyWakeUp.NothingToWithdraw.selector);
        game.withdraw();
        // revert 会回滚所有状态变更，score 仍保持 1000，等下次签到时才会真正重置
        assertEq(game.score(), 1000);
    }

    function test_WithdrawPartialReward() public {
        // 第 26-30 天连续签到 5 天，score = 500
        _checkInDays(25, 5);
        assertEq(game.score(), 500);

        vm.deal(address(game), 1 ether);
        _warpToDay(30); // targetTime 当天，无漏签

        uint256 ownerBalanceBefore = owner.balance;
        vm.prank(owner);
        game.withdraw();
        uint256 ownerBalanceAfter = owner.balance;

        assertEq(ownerBalanceAfter - ownerBalanceBefore, 0.5 ether);
        assertEq(game.score(), 0);
    }

    function test_WithdrawCappedAt100Percent() public {
        // 第 19-30 天连续签到 12 天，score = 1200
        _checkInDays(18, 12);
        assertEq(game.score(), 1200);

        vm.deal(address(game), 2 ether);
        _warpToDay(30); // targetTime 当天，无漏签

        uint256 ownerBalanceBefore = owner.balance;
        vm.prank(owner);
        game.withdraw();
        uint256 ownerBalanceAfter = owner.balance;

        assertEq(ownerBalanceAfter - ownerBalanceBefore, 2 ether);
        assertEq(game.score(), 0);
    }

    function test_WithdrawResetsScoreAndCannotWithdrawAgain() public {
        _checkInDays(25, 5);
        assertEq(game.score(), 500);

        vm.deal(address(game), 1 ether);
        _warpToDay(30);

        vm.prank(owner);
        game.withdraw();
        assertEq(game.score(), 0);

        vm.prank(owner);
        vm.expectRevert(EarlyWakeUp.NothingToWithdraw.selector);
        game.withdraw();
    }

    function test_WithdrawKeepsRemainingPool() public {
        _checkInDays(25, 5);
        assertEq(game.score(), 500);

        vm.deal(address(game), 1 ether);
        _warpToDay(30);

        vm.prank(owner);
        game.withdraw();
        assertEq(address(game).balance, 0.5 ether);
        assertEq(game.score(), 0);
    }

    function test_ClaimableRewardView() public {
        _checkInDays(25, 5);
        assertEq(game.score(), 500);

        vm.deal(address(game), 1 ether);
        _warpToDay(30);
        assertEq(game.claimableReward(), 0.5 ether);
    }

    function test_ClaimableRewardWithMissedDays() public {
        _checkInDays(25, 5);
        assertEq(game.score(), 500);

        vm.deal(address(game), 1 ether);
        _warpToDay(31); // 漏签 1 天 -> 500 * 0.8 = 400
        assertEq(game.claimableReward(), 0.4 ether);
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

    function test_ConstructorZeroTargetReverts() public {
        vm.prank(owner);
        vm.expectRevert(EarlyWakeUp.InvalidTarget.selector);
        new EarlyWakeUp(0, JAN1_UTC8 + 30 days);
    }

    function test_NothingToWithdrawReverts() public {
        _warpToDay(30);
        vm.prank(owner);
        vm.expectRevert(EarlyWakeUp.NothingToWithdraw.selector);
        game.withdraw();
    }

    function test_WithdrawAfterMissedDaysUsesPenalizedScore() public {
        _checkInDays(25, 5);
        assertEq(game.score(), 500);

        vm.deal(address(game), 1 ether);
        _warpToDay(31); // 漏签 1 天 -> 500 * 0.8 = 400

        uint256 ownerBalanceBefore = owner.balance;
        vm.prank(owner);
        game.withdraw();
        uint256 ownerBalanceAfter = owner.balance;

        assertEq(ownerBalanceAfter - ownerBalanceBefore, 0.4 ether);
        assertEq(game.score(), 0);
    }
}
