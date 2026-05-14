// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "./IERC20.sol";

contract AgentVault {
    struct Vault {
        address owner;
        address agent;
        address token;
        uint256 budget;
        uint256 spent;
        uint256 singleSpendLimit;
        bool active;
    }

    uint256 public nextVaultId = 1;
    mapping(uint256 => Vault) public vaults;
    mapping(uint256 => mapping(address => bool)) public allowedRecipients;

    event VaultCreated(
        uint256 indexed vaultId,
        address indexed owner,
        address indexed agent,
        address token,
        uint256 budget,
        uint256 singleSpendLimit
    );
    event RecipientAllowed(uint256 indexed vaultId, address indexed recipient, bool allowed);
    event AgentSpent(
        uint256 indexed vaultId,
        address indexed agent,
        address indexed recipient,
        address token,
        uint256 amount,
        string memo
    );
    event VaultStatusChanged(uint256 indexed vaultId, bool active);

    error InvalidAddress();
    error InvalidAmount();
    error VaultNotFound();
    error NotOwner();
    error NotAgent();
    error VaultInactive();
    error RecipientNotAllowed();
    error LimitExceeded();

    function createVault(
        address agent,
        address token,
        uint256 budget,
        uint256 singleSpendLimit,
        address[] calldata recipients
    ) external returns (uint256 vaultId) {
        if (agent == address(0) || token == address(0)) revert InvalidAddress();
        if (budget == 0 || singleSpendLimit == 0 || singleSpendLimit > budget) revert InvalidAmount();

        vaultId = nextVaultId++;
        vaults[vaultId] = Vault({
            owner: msg.sender,
            agent: agent,
            token: token,
            budget: budget,
            spent: 0,
            singleSpendLimit: singleSpendLimit,
            active: true
        });

        for (uint256 i = 0; i < recipients.length; i++) {
            allowedRecipients[vaultId][recipients[i]] = true;
            emit RecipientAllowed(vaultId, recipients[i], true);
        }

        emit VaultCreated(vaultId, msg.sender, agent, token, budget, singleSpendLimit);
    }

    function setRecipient(uint256 vaultId, address recipient, bool allowed) external onlyOwner(vaultId) {
        if (recipient == address(0)) revert InvalidAddress();
        allowedRecipients[vaultId][recipient] = allowed;
        emit RecipientAllowed(vaultId, recipient, allowed);
    }

    function setActive(uint256 vaultId, bool active) external onlyOwner(vaultId) {
        vaults[vaultId].active = active;
        emit VaultStatusChanged(vaultId, active);
    }

    function spend(uint256 vaultId, address recipient, uint256 amount, string calldata memo) external {
        Vault storage vault = vaults[vaultId];
        if (vault.owner == address(0)) revert VaultNotFound();
        if (msg.sender != vault.agent) revert NotAgent();
        if (!vault.active) revert VaultInactive();
        if (!allowedRecipients[vaultId][recipient]) revert RecipientNotAllowed();
        if (amount == 0 || amount > vault.singleSpendLimit || vault.spent + amount > vault.budget) {
            revert LimitExceeded();
        }

        vault.spent += amount;
        bool ok = IERC20(vault.token).transferFrom(vault.owner, recipient, amount);
        require(ok, "TRANSFER_FROM_FAILED");

        emit AgentSpent(vaultId, msg.sender, recipient, vault.token, amount, memo);
    }

    modifier onlyOwner(uint256 vaultId) {
        Vault storage vault = vaults[vaultId];
        if (vault.owner == address(0)) revert VaultNotFound();
        if (msg.sender != vault.owner) revert NotOwner();
        _;
    }
}
