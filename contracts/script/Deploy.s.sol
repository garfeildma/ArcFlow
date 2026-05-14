// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {PaymentIntentRegistry} from "../src/PaymentIntentRegistry.sol";
import {AgentVault} from "../src/AgentVault.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        PaymentIntentRegistry registry = new PaymentIntentRegistry();
        AgentVault vault = new AgentVault();

        vm.stopBroadcast();

        console2.log("PaymentIntentRegistry:", address(registry));
        console2.log("AgentVault:", address(vault));
    }
}
