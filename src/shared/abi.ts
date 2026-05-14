export const paymentIntentRegistryAbi = [
  {
    type: "event",
    name: "IntentCreated",
    inputs: [
      { name: "intentId", type: "uint256", indexed: true },
      { name: "slugHash", type: "bytes32", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "token", type: "address", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
      { name: "metadataUri", type: "string", indexed: false }
    ]
  },
  {
    type: "event",
    name: "IntentPaid",
    inputs: [
      { name: "intentId", type: "uint256", indexed: true },
      { name: "payer", type: "address", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "token", type: "address", indexed: false },
      { name: "amount", type: "uint256", indexed: false }
    ]
  },
  {
    type: "function",
    name: "createIntent",
    stateMutability: "nonpayable",
    inputs: [
      { name: "slugHash", type: "bytes32" },
      { name: "recipient", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "metadataUri", type: "string" }
    ],
    outputs: [{ name: "intentId", type: "uint256" }]
  },
  {
    type: "function",
    name: "payIntent",
    stateMutability: "nonpayable",
    inputs: [{ name: "intentId", type: "uint256" }],
    outputs: []
  }
] as const;

export const agentVaultAbi = [
  {
    type: "event",
    name: "VaultCreated",
    inputs: [
      { name: "vaultId", type: "uint256", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "agent", type: "address", indexed: true },
      { name: "token", type: "address", indexed: false },
      { name: "budget", type: "uint256", indexed: false },
      { name: "singleSpendLimit", type: "uint256", indexed: false }
    ]
  },
  {
    type: "event",
    name: "AgentSpent",
    inputs: [
      { name: "vaultId", type: "uint256", indexed: true },
      { name: "agent", type: "address", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "token", type: "address", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
      { name: "memo", type: "string", indexed: false }
    ]
  }
] as const;
