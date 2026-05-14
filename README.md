# ArcFlow

ArcFlow is a Arc dapp for three stablecoin workflows:

- Pay links and invoices
- Hosted checkout that settles to Arc
- AI agent spend vaults with offchain policy records and onchain spend controls

[Demo App](https://arcflow.xgamma.workers.dev/)

## Why ArcFlow

ArcFlow is designed as an Arc-native stablecoin operations workspace. The MVP focuses on three workflows that help teams move from ad hoc wallet transfers to trackable, policy-aware payment operations.

### Pay Links / Invoice

Pay links and invoices give small teams, freelancers, and crypto-native businesses a simple way to request USDC or EURC payments without building custom checkout infrastructure. Each payment request has a clear amount, recipient, status, and onchain settlement trail, which makes it easier to reconcile incoming revenue, share payable links with customers, and reduce manual wallet-to-wallet coordination.

### Cross-chain USDC Checkout

Cross-chain USDC checkout lets a merchant present one hosted checkout experience while routing payment liquidity from another chain and settling value on Arc. This reduces payer friction because customers can start from the chain where they already hold USDC, while the merchant can standardize settlement, indexing, and reporting around Arc. For developers, the same payment intent model can later plug into CCTP or Arc App Kit routing without changing the core invoice and dashboard flow.

### AI Agent Spend Vault

AI agent spend vaults make autonomous payments safer by separating agent execution from owner-controlled budgets and policies. A team can fund a vault, define spend limits and allowed recipients, and let an agent initiate payment intents within those constraints. This turns agent payments into auditable, bounded operations instead of unrestricted wallet access, which is useful for usage-based APIs, recurring operational tasks, and controlled treasury automation.

## Stack

- Frontend: React, Vite, Privy, viem
- API: Hono on Cloudflare Workers
- Database: Supabase Postgres via PostgREST
- Indexing: Cloudflare Scheduled Worker + viem `getLogs`
- Contracts: Foundry

## Arc Defaults

- Chain id: `5042002`
- RPC: `https://rpc.testnet.arc.network`

Token and contract addresses are intentionally environment-driven because Arc public testnet assets may change.

## Setup

```bash
npm install
cp .dev.vars.example .dev.vars
```

Fill `.dev.vars`:

```bash
SUPABASE_URL=...
SUPABASE_SECRET_KEY=...
PRIVY_APP_ID=...
PAYMENT_REGISTRY_ADDRESS=...
AGENT_VAULT_ADDRESS=...
USDC_ADDRESS=...
EURC_ADDRESS=...
```

For the browser build, also set:

```bash
VITE_PRIVY_APP_ID=...
```

## Database

Run the SQL in:

```text
supabase/migrations/0001_initial_schema.sql
```

The Worker uses the Supabase secret key, so row-level security is enabled but API ownership checks are enforced in Hono. Never expose the secret key in the browser build.

## Contracts

```bash
npm run contracts:test
```

Deploy to Arc testnet:

```bash
export PRIVATE_KEY=...
export ARC_RPC_URL=https://rpc.testnet.arc.network
npm run contracts:deploy
```

Copy the deployed addresses into `.dev.vars` and Cloudflare Worker secrets/vars.

## Development

Frontend dev server:

```bash
npm run dev
```

Production build:

```bash
npm run build
npm run typecheck:worker
```

Cloudflare deploy:

```bash
npm run build
npm run deploy
```

## Indexer

The scheduled Worker runs every five minutes. It reads `IntentCreated`, `IntentPaid`, `VaultCreated`, and `AgentSpent` logs, stores raw events in Supabase, and marks matching payment intents as `paid` when an `IntentPaid` event is found.

For manual indexing during development:

```http
POST /api/indexer/run
Authorization: Bearer <privy-token>
```

## TODO

- The cross-chain checkout UI is modeled as a hosted payment intent with route metadata. Actual CCTP/App Kit bridge execution should be added once the relevant Arc testnet contracts and SDK endpoints are finalized for your app.
- The app uses polling with `getLogs`, not websocket subscriptions, because Cloudflare Workers free plan is request/cron driven rather than a persistent process.
