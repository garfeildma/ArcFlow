export type Env = {
  ASSETS: Fetcher;
  SUPABASE_URL: string;
  SUPABASE_SECRET_KEY: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_ANON_KEY?: string;
  PRIVY_APP_ID: string;
  PRIVY_VERIFICATION_KEY?: string;
  ARC_RPC_URL: string;
  ARC_CHAIN_ID: string;
  ARC_BLOCK_EXPLORER_URL?: string;
  PAYMENT_REGISTRY_ADDRESS?: `0x${string}`;
  AGENT_VAULT_ADDRESS?: `0x${string}`;
  USDC_ADDRESS?: `0x${string}`;
  EURC_ADDRESS?: `0x${string}`;
  DEFAULT_CURRENCY?: "USDC" | "EURC";
};

export type AuthUser = {
  privyUserId: string;
  walletAddress?: string;
  email?: string;
};

export type Profile = {
  id: string;
  privy_user_id: string;
  wallet_address: string | null;
  business_name: string;
  email: string | null;
  created_at: string;
  updated_at: string;
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
