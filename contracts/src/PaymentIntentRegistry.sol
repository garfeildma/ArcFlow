// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "./IERC20.sol";

contract PaymentIntentRegistry {
    enum Status {
        Created,
        Paid,
        Refunded,
        Cancelled
    }

    struct Intent {
        address creator;
        address recipient;
        address token;
        uint256 amount;
        bytes32 slugHash;
        string metadataUri;
        Status status;
        uint64 createdAt;
        uint64 paidAt;
    }

    uint256 public nextIntentId = 1;
    mapping(uint256 => Intent) public intents;
    mapping(bytes32 => uint256) public intentIdBySlugHash;

    event IntentCreated(
        uint256 indexed intentId,
        bytes32 indexed slugHash,
        address indexed recipient,
        address token,
        uint256 amount,
        string metadataUri
    );
    event IntentPaid(
        uint256 indexed intentId,
        address indexed payer,
        address indexed recipient,
        address token,
        uint256 amount
    );
    event IntentCancelled(uint256 indexed intentId);

    error InvalidAddress();
    error InvalidAmount();
    error SlugAlreadyUsed();
    error IntentNotFound();
    error IntentNotPayable();
    error NotCreator();

    function createIntent(
        bytes32 slugHash,
        address recipient,
        address token,
        uint256 amount,
        string calldata metadataUri
    ) external returns (uint256 intentId) {
        if (recipient == address(0) || token == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        if (intentIdBySlugHash[slugHash] != 0) revert SlugAlreadyUsed();

        intentId = nextIntentId++;
        intents[intentId] = Intent({
            creator: msg.sender,
            recipient: recipient,
            token: token,
            amount: amount,
            slugHash: slugHash,
            metadataUri: metadataUri,
            status: Status.Created,
            createdAt: uint64(block.timestamp),
            paidAt: 0
        });
        intentIdBySlugHash[slugHash] = intentId;

        emit IntentCreated(intentId, slugHash, recipient, token, amount, metadataUri);
    }

    function payIntent(uint256 intentId) external {
        Intent storage intent = intents[intentId];
        if (intent.recipient == address(0)) revert IntentNotFound();
        if (intent.status != Status.Created) revert IntentNotPayable();

        intent.status = Status.Paid;
        intent.paidAt = uint64(block.timestamp);

        bool ok = IERC20(intent.token).transferFrom(msg.sender, intent.recipient, intent.amount);
        require(ok, "TRANSFER_FROM_FAILED");

        emit IntentPaid(intentId, msg.sender, intent.recipient, intent.token, intent.amount);
    }

    function cancelIntent(uint256 intentId) external {
        Intent storage intent = intents[intentId];
        if (intent.recipient == address(0)) revert IntentNotFound();
        if (msg.sender != intent.creator) revert NotCreator();
        if (intent.status != Status.Created) revert IntentNotPayable();

        intent.status = Status.Cancelled;
        emit IntentCancelled(intentId);
    }
}
