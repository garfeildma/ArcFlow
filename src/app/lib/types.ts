export type AppConfig = {
  chainId: number;
  rpcUrl: string;
  explorerUrl?: string;
  privyAppId: string;
  paymentRegistryAddress?: `0x${string}`;
  agentVaultAddress?: `0x${string}`;
  tokens: {
    USDC?: `0x${string}`;
    EURC?: `0x${string}`;
  };
};

export type PaymentIntent = {
  id: string;
  owner_id: string;
  slug: string;
  source: "invoice" | "checkout" | "agent";
  title: string;
  description: string | null;
  payer_email: string | null;
  recipient_address: string;
  amount: string;
  currency: "USDC" | "EURC";
  settlement_chain_id: number;
  source_chain_id: number | null;
  status: "created" | "pending" | "paid" | "failed" | "refunded" | "expired";
  onchain_intent_id: string | null;
  tx_hash: string | null;
  paid_at: string | null;
  due_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type AgentVault = {
  id: string;
  owner_id: string;
  name: string;
  agent_label: string;
  vault_address: string | null;
  currency: "USDC" | "EURC";
  budget_amount: string;
  spent_amount: string;
  single_spend_limit: string;
  allowed_recipients: string[];
  status: "active" | "paused" | "closed";
  policy: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};
