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

    function setUp() public {
        vm.prank(owner);
        game = new EarlyWakeUp(1000);
    }

    function test_InitialState() public view {
        assertEq(game.owner(), owner);
        assertEq(game.target(), 1000);
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
        vm.warp(JAN1_UTC8 + 5 hours + 30 minutes);
        vm.prank(owner);
        game.checkIn();
        assertEq(game.score(), 100);
        assertEq(game.lastCheckIn(), JAN1_UTC8 + 5 hours + 30 minutes);
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
        vm.warp(JAN1_UTC8 + 6 hours);
        vm.prank(owner);
        game.checkIn();

        vm.warp(JAN1_UTC8 + 7 hours);
        vm.prank(owner);
        vm.expectRevert(EarlyWakeUp.AlreadyCheckedInToday.selector);
        game.checkIn();
    }

    function test_OnlyOwnerCanCheckIn() public {
        vm.warp(JAN1_UTC8 + 6 hours);
        vm.prank(donor);
        vm.expectRevert(EarlyWakeUp.NotOwner.selector);
        game.checkIn();
    }

    function test_OnlyOwnerCanWithdraw() public {
        vm.prank(donor);
        vm.expectRevert(EarlyWakeUp.NotOwner.selector);
        game.withdraw();
    }

    function test_OneMissedDayPenalty() public {
        vm.warp(JAN1_UTC8 + 6 hours);
        vm.prank(owner);
        game.checkIn();
        assertEq(game.score(), 100);

        vm.warp(JAN1_UTC8 + 2 days + 6 hours);
        vm.prank(owner);
        game.checkIn();
        assertEq(game.score(), 180);
    }

    function test_TwoMissedDaysPenalty() public {
        vm.warp(JAN1_UTC8 + 6 hours);
        vm.prank(owner);
        game.checkIn();
        assertEq(game.score(), 100);

        vm.warp(JAN1_UTC8 + 3 days + 6 hours);
        vm.prank(owner);
        game.checkIn();
        assertEq(game.score(), 0);
    }

    function test_ResetThenContinue() public {
        vm.warp(JAN1_UTC8 + 6 hours);
        vm.prank(owner);
        game.checkIn();

        vm.warp(JAN1_UTC8 + 3 days + 6 hours);
        vm.prank(owner);
        game.checkIn();
        assertEq(game.score(), 0);

        vm.warp(JAN1_UTC8 + 4 days + 6 hours);
        vm.prank(owner);
        game.checkIn();
        assertEq(game.score(), 100);
    }

    function test_HighScoreResetsAfterManyMissedDays() public {
        for (uint256 i = 0; i < 10; i++) {
            vm.warp(JAN1_UTC8 + i * DAY + 6 hours);
            vm.prank(owner);
            game.checkIn();
        }
        assertEq(game.score(), 1000);

        vm.warp(JAN1_UTC8 + 20 days + 6 hours);
        vm.prank(owner);
        game.checkIn();
        assertEq(game.score(), 205);
    }

    function test_WithdrawPartialReward() public {
        for (uint256 i = 0; i < 5; i++) {
            vm.warp(JAN1_UTC8 + i * DAY + 6 hours);
            vm.prank(owner);
            game.checkIn();
        }
        assertEq(game.score(), 500);

        vm.deal(address(game), 1 ether);

        uint256 ownerBalanceBefore = owner.balance;
        vm.prank(owner);
        game.withdraw();
        uint256 ownerBalanceAfter = owner.balance;

        assertEq(ownerBalanceAfter - ownerBalanceBefore, 0.5 ether);
        assertEq(game.score(), 0);
    }

    function test_WithdrawCappedAt100Percent() public {
        for (uint256 i = 0; i < 12; i++) {
            vm.warp(JAN1_UTC8 + i * DAY + 6 hours);
            vm.prank(owner);
            game.checkIn();
        }
        assertEq(game.score(), 1200);

        vm.deal(address(game), 2 ether);

        uint256 ownerBalanceBefore = owner.balance;
        vm.prank(owner);
        game.withdraw();
        uint256 ownerBalanceAfter = owner.balance;

        assertEq(ownerBalanceAfter - ownerBalanceBefore, 2 ether);
        assertEq(game.score(), 0);
    }

    function test_WithdrawResetsScoreAndCannotWithdrawAgain() public {
        for (uint256 i = 0; i < 5; i++) {
            vm.warp(JAN1_UTC8 + i * DAY + 6 hours);
            vm.prank(owner);
            game.checkIn();
        }

        vm.deal(address(game), 1 ether);

        vm.prank(owner);
        game.withdraw();
        assertEq(game.score(), 0);

        vm.prank(owner);
        vm.expectRevert(EarlyWakeUp.NothingToWithdraw.selector);
        game.withdraw();
    }

    function test_WithdrawKeepsRemainingPool() public {
        for (uint256 i = 0; i < 5; i++) {
            vm.warp(JAN1_UTC8 + i * DAY + 6 hours);
            vm.prank(owner);
            game.checkIn();
        }
        vm.deal(address(game), 1 ether);

        vm.prank(owner);
        game.withdraw();
        assertEq(address(game).balance, 0.5 ether);
        assertEq(game.score(), 0);
    }

    function test_SetTargetNewCycle() public {
        vm.prank(owner);
        game.setTarget(2000);
        assertEq(game.target(), 2000);
        assertEq(game.score(), 0);
        assertEq(game.lastCheckIn(), 0);
    }

    function test_SetTargetDuringCycleReverts() public {
        vm.warp(JAN1_UTC8 + 6 hours);
        vm.prank(owner);
        game.checkIn();

        vm.prank(owner);
        vm.expectRevert(EarlyWakeUp.CycleInProgress.selector);
        game.setTarget(2000);
    }

    function test_ClaimableRewardView() public {
        for (uint256 i = 0; i < 5; i++) {
            vm.warp(JAN1_UTC8 + i * DAY + 6 hours);
            vm.prank(owner);
            game.checkIn();
        }
        vm.deal(address(game), 1 ether);
        assertEq(game.claimableReward(), 0.5 ether);
    }

    function test_MissedDaysView() public {
        vm.warp(JAN1_UTC8 + 6 hours);
        vm.prank(owner);
        game.checkIn();

        vm.warp(JAN1_UTC8 + 4 days + 6 hours);
        assertEq(game.missedDays(), 3);
    }

    function test_PenalizedScoreView() public view {
        assertEq(game.penalizedScore(), 0);
    }

    function test_ConstructorZeroTargetReverts() public {
        vm.prank(owner);
        vm.expectRevert(EarlyWakeUp.InvalidTarget.selector);
        new EarlyWakeUp(0);
    }

    function test_SetTargetZeroReverts() public {
        vm.prank(owner);
        vm.expectRevert(EarlyWakeUp.InvalidTarget.selector);
        game.setTarget(0);
    }

    function test_NothingToWithdrawReverts() public {
        vm.prank(owner);
        vm.expectRevert(EarlyWakeUp.NothingToWithdraw.selector);
        game.withdraw();
    }
}
