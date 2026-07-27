// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {EarlyWakeUp} from "../src/EarlyWakeUp.sol";

contract EarlyWakeUpScript is Script {
    EarlyWakeUp public game;

    function setUp() public {}

    function run() public {
        uint256 target = vm.envUint("TARGET");
        uint256 cooldown = vm.envUint("COOLDOWN");
        // 私钥/账户通过 CLI 传入（--private-key 或 --account），
        // 不写在脚本里，避免把敏感信息提交到 git。
        vm.startBroadcast();
        game = new EarlyWakeUp(target, cooldown);
        vm.stopBroadcast();
    }
}
