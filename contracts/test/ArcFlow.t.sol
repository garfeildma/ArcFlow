// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {PaymentIntentRegistry} from "../src/PaymentIntentRegistry.sol";
import {AgentVault} from "../src/AgentVault.sol";
import {MockERC20} from "../src/MockERC20.sol";

contract ArcFlowTest is Test {
    PaymentIntentRegistry registry;
    AgentVault vault;
    MockERC20 usdc;

    address payer = address(0xA11CE);
    address merchant = address(0xB0B);
    address agent = address(0xA6E17);

    function setUp() public {
        registry = new PaymentIntentRegistry();
        vault = new AgentVault();
        usdc = new MockERC20("USD Coin", "USDC", 6);
        usdc.mint(payer, 1_000e6);
        usdc.mint(merchant, 1_000e6);
    }

    function testCreateAndPayIntent() public {
        uint256 intentId = registry.createIntent(keccak256("inv_1"), merchant, address(usdc), 25e6, "supabase://inv_1");

        vm.prank(payer);
        usdc.approve(address(registry), 25e6);

        vm.prank(payer);
        registry.payIntent(intentId);

        assertEq(usdc.balanceOf(merchant), 1_025e6);
        (, , , , , , PaymentIntentRegistry.Status status, , uint64 paidAt) = registry.intents(intentId);
        assertEq(uint8(status), uint8(PaymentIntentRegistry.Status.Paid));
        assertGt(paidAt, 0);
    }

    function testAgentVaultSpendHonorsPolicy() public {
        address[] memory recipients = new address[](1);
        recipients[0] = payer;

        vm.prank(merchant);
        uint256 vaultId = vault.createVault(agent, address(usdc), 100e6, 10e6, recipients);

        vm.prank(merchant);
        usdc.approve(address(vault), 100e6);

        vm.prank(agent);
        vault.spend(vaultId, payer, 7e6, "api usage");

        assertEq(usdc.balanceOf(payer), 1_007e6);
    }

    function testAgentVaultBlocksUnknownRecipient() public {
        address[] memory recipients = new address[](0);

        vm.prank(merchant);
        uint256 vaultId = vault.createVault(agent, address(usdc), 100e6, 10e6, recipients);

        vm.prank(agent);
        vm.expectRevert(AgentVault.RecipientNotAllowed.selector);
        vault.spend(vaultId, payer, 7e6, "blocked");
    }
}
