import { Hono } from "hono";
import { cors } from "hono/cors";
import { assertAddress, assertPositiveAmount, jsonError, randomSlug, readJson } from "./lib/http";
import { authMiddleware, type AppContext } from "./lib/auth";
import { SupabaseRest } from "./lib/supabase";
import { runIndexer } from "./lib/indexer";
import type { AgentVault, Env, PaymentIntent } from "./types";

type AppEnv = {
  Bindings: Env;
  Variables: {
    user: import("./types").AuthUser;
    profile: import("./types").Profile;
  };
};

const app = new Hono<AppEnv>();

app.use(
  "/api/*",
  cors({
    origin: ["http://localhost:5173", "https://arcflow.pages.dev"],
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "PATCH", "OPTIONS"],
    credentials: true
  })
);

app.get("/api/config", (c) => {
  return c.json({
    chainId: Number(c.env.ARC_CHAIN_ID || 5042002),
    rpcUrl: c.env.ARC_RPC_URL,
    explorerUrl: c.env.ARC_BLOCK_EXPLORER_URL,
    privyAppId: c.env.PRIVY_APP_ID,
    paymentRegistryAddress: c.env.PAYMENT_REGISTRY_ADDRESS,
    agentVaultAddress: c.env.AGENT_VAULT_ADDRESS,
    tokens: {
      USDC: c.env.USDC_ADDRESS,
      EURC: c.env.EURC_ADDRESS
    }
  });
});

app.get("/api/checkout/:slug", async (c) => {
  try {
    const db = new SupabaseRest(c.env);
    const [intent] = await db.select<PaymentIntent>("payment_intents", {
      select: "*",
      slug: `eq.${c.req.param("slug")}`,
      limit: 1
    });

    if (!intent) return jsonError(c, 404, "Payment intent not found");
    return c.json({ intent });
  } catch (error) {
    return jsonError(c, 500, "Unable to load checkout", error instanceof Error ? error.message : error);
  }
});

app.use("/api/me", authMiddleware);
app.use("/api/invoices/*", authMiddleware);
app.use("/api/invoices", authMiddleware);
app.use("/api/payment-intents/*", authMiddleware);
app.use("/api/payment-intents", authMiddleware);
app.use("/api/agent-vaults/*", authMiddleware);
app.use("/api/agent-vaults", authMiddleware);
app.use("/api/indexer/run", authMiddleware);

app.get("/api/me", (c) => {
  return c.json({
    user: c.get("user"),
    profile: c.get("profile")
  });
});

app.get("/api/payment-intents", async (c) => {
  try {
    const db = new SupabaseRest(c.env);
    const rows = await db.select<PaymentIntent>("payment_intents", {
      select: "*",
      owner_id: `eq.${c.get("profile").id}`,
      order: "created_at.desc"
    });
    return c.json({ intents: rows });
  } catch (error) {
    return jsonError(c, 500, "Unable to list payment intents", error instanceof Error ? error.message : error);
  }
});

app.post("/api/payment-intents", async (c: AppContext) => {
  try {
    const input = await readJson<{
      source?: "invoice" | "checkout" | "agent";
      title?: string;
      description?: string;
      payerEmail?: string;
      recipientAddress?: string;
      amount?: string;
      currency?: "USDC" | "EURC";
      dueAt?: string;
      sourceChainId?: number;
      metadata?: Record<string, unknown>;
    }>(c);

    if (!input.title?.trim()) throw new Error("title is required");
    if (!input.recipientAddress) throw new Error("recipientAddress is required");
    if (!input.amount) throw new Error("amount is required");
    assertAddress(input.recipientAddress, "recipientAddress");
    assertPositiveAmount(input.amount);

    const slug = randomSlug(input.source === "agent" ? "agent" : input.source === "checkout" ? "chk" : "inv");
    const db = new SupabaseRest(c.env);
    const [intent] = await db.insert<PaymentIntent>("payment_intents", {
      owner_id: c.get("profile").id,
      slug,
      source: input.source ?? "invoice",
      title: input.title.trim(),
      description: input.description ?? null,
      payer_email: input.payerEmail ?? null,
      recipient_address: input.recipientAddress,
      amount: input.amount,
      currency: input.currency ?? c.env.DEFAULT_CURRENCY ?? "USDC",
      settlement_chain_id: Number(c.env.ARC_CHAIN_ID || 5042002),
      source_chain_id: input.sourceChainId ?? null,
      due_at: input.dueAt ?? null,
      metadata: input.metadata ?? {}
    });

    return c.json({ intent }, 201);
  } catch (error) {
    return jsonError(c, 400, "Unable to create payment intent", error instanceof Error ? error.message : error);
  }
});

app.patch("/api/payment-intents/:id", async (c) => {
  try {
    const input = await readJson<{ status?: PaymentIntent["status"]; onchainIntentId?: string; txHash?: string }>(c);
    const allowed = ["created", "pending", "paid", "failed", "refunded", "expired"];
    if (input.status && !allowed.includes(input.status)) throw new Error("Invalid status");

    const db = new SupabaseRest(c.env);
    const [intent] = await db.update<PaymentIntent>(
      "payment_intents",
      `id=eq.${c.req.param("id")}&owner_id=eq.${c.get("profile").id}`,
      {
        status: input.status,
        onchain_intent_id: input.onchainIntentId,
        tx_hash: input.txHash,
        paid_at: input.status === "paid" ? new Date().toISOString() : undefined
      }
    );

    if (!intent) return jsonError(c, 404, "Payment intent not found");
    return c.json({ intent });
  } catch (error) {
    return jsonError(c, 400, "Unable to update payment intent", error instanceof Error ? error.message : error);
  }
});

app.get("/api/agent-vaults", async (c) => {
  try {
    const db = new SupabaseRest(c.env);
    const rows = await db.select<AgentVault>("agent_vaults", {
      select: "*",
      owner_id: `eq.${c.get("profile").id}`,
      order: "created_at.desc"
    });
    return c.json({ vaults: rows });
  } catch (error) {
    return jsonError(c, 500, "Unable to list agent vaults", error instanceof Error ? error.message : error);
  }
});

app.post("/api/agent-vaults", async (c: AppContext) => {
  try {
    const input = await readJson<{
      name?: string;
      agentLabel?: string;
      currency?: "USDC" | "EURC";
      budgetAmount?: string;
      singleSpendLimit?: string;
      allowedRecipients?: string[];
      policy?: Record<string, unknown>;
    }>(c);

    if (!input.name?.trim()) throw new Error("name is required");
    if (!input.agentLabel?.trim()) throw new Error("agentLabel is required");
    if (!input.budgetAmount) throw new Error("budgetAmount is required");
    if (!input.singleSpendLimit) throw new Error("singleSpendLimit is required");
    assertPositiveAmount(input.budgetAmount);
    assertPositiveAmount(input.singleSpendLimit);
    for (const recipient of input.allowedRecipients ?? []) assertAddress(recipient, "allowedRecipients");

    const db = new SupabaseRest(c.env);
    const [vault] = await db.insert<AgentVault>("agent_vaults", {
      owner_id: c.get("profile").id,
      name: input.name.trim(),
      agent_label: input.agentLabel.trim(),
      currency: input.currency ?? c.env.DEFAULT_CURRENCY ?? "USDC",
      budget_amount: input.budgetAmount,
      single_spend_limit: input.singleSpendLimit,
      allowed_recipients: input.allowedRecipients ?? [],
      policy: input.policy ?? {}
    });

    return c.json({ vault }, 201);
  } catch (error) {
    return jsonError(c, 400, "Unable to create agent vault", error instanceof Error ? error.message : error);
  }
});

app.post("/api/agent-vaults/:id/spend", async (c: AppContext) => {
  try {
    const input = await readJson<{ recipientAddress?: string; amount?: string; memo?: string }>(c);
    if (!input.recipientAddress) throw new Error("recipientAddress is required");
    if (!input.amount) throw new Error("amount is required");
    assertAddress(input.recipientAddress, "recipientAddress");
    assertPositiveAmount(input.amount);

    const db = new SupabaseRest(c.env);
    const [vault] = await db.select<AgentVault>("agent_vaults", {
      select: "*",
      id: `eq.${c.req.param("id")}`,
      owner_id: `eq.${c.get("profile").id}`,
      limit: 1
    });
    if (!vault) return jsonError(c, 404, "Agent vault not found");
    if (vault.status !== "active") throw new Error("Vault is not active");
    if (Number(input.amount) > Number(vault.single_spend_limit)) throw new Error("Amount exceeds single spend limit");
    if (vault.allowed_recipients.length && !vault.allowed_recipients.map((v) => v.toLowerCase()).includes(input.recipientAddress.toLowerCase())) {
      throw new Error("Recipient is not allowed by this vault policy");
    }

    const [intent] = await db.insert<PaymentIntent>("payment_intents", {
      owner_id: c.get("profile").id,
      slug: randomSlug("agent"),
      source: "agent",
      title: `${vault.agent_label} spend`,
      description: input.memo ?? null,
      recipient_address: input.recipientAddress,
      amount: input.amount,
      currency: vault.currency,
      settlement_chain_id: Number(c.env.ARC_CHAIN_ID || 5042002),
      metadata: { vaultId: vault.id, policy: vault.policy }
    });

    return c.json({ intent }, 201);
  } catch (error) {
    return jsonError(c, 400, "Unable to create agent spend", error instanceof Error ? error.message : error);
  }
});

app.post("/api/indexer/run", async (c) => {
  try {
    const result = await runIndexer(c.env);
    return c.json({ result });
  } catch (error) {
    return jsonError(c, 500, "Indexer failed", error instanceof Error ? error.message : error);
  }
});

app.notFound(async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default {
  fetch: app.fetch,
  async scheduled(_: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runIndexer(env));
  }
};
