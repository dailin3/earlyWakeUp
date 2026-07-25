// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {EarlyWakeUp} from "../src/EarlyWakeUp.sol";

contract EarlyWakeUpScript is Script {
    EarlyWakeUp public game;

    function setUp() public {}

    function run() public {
        uint256 target = vm.envUint("TARGET");
        vm.startBroadcast();
        game = new EarlyWakeUp(target);
        vm.stopBroadcast();
    }
}
