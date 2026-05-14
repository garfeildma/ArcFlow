import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";

const recipientAddress = "0x2222222222222222222222222222222222222222";
const allowedRecipient = "0x3333333333333333333333333333333333333333";

type PaymentIntent = {
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

type AgentVault = {
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

test.beforeEach(async ({ context }) => {
  await mockArcFlowApi(context);
});

test("creates an invoice and sends the on-chain create transaction", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "ArcFlow" })).toBeVisible();
  await page.getByRole("button", { name: "Invoices" }).click();

  await fillForm(page, "Create invoice", {
    title: "Design retainer",
    amount: "250.00",
    payerEmail: "finance@example.com",
    recipientAddress
  });
  await submitForm(page, "Create invoice");

  await expect(page.getByText("Payment intent created")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Design retainer" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "250.00 USDC" })).toBeVisible();

  await clickByTitle(page, "Create intent on-chain");
  await expect(page.locator(".notice")).toHaveText("Create transaction sent");
  await expect(page.getByText("Pending")).toBeVisible();
});

test("creates a checkout link and opens the public checkout page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Checkout" }).click();

  await fillForm(page, "Create checkout link", {
    title: "API credits",
    amount: "50.00",
    recipientAddress
  });
  await submitForm(page, "Create checkout link");

  await expect(page.getByText("Payment intent created")).toBeVisible();
  await expect(page.getByRole("cell", { name: "API credits" })).toBeVisible();

  const checkoutHref = await page.getByRole("link", { name: /Open/ }).getAttribute("href");
  expect(checkoutHref).toBeTruthy();
  await page.goto(checkoutHref!);

  await expect(page.getByRole("heading", { name: "API credits" })).toBeVisible();
  await expect(page.getByText("50.00")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pay with USDC" })).toBeVisible();
});

test("creates an agent vault and an agent spend intent", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Agent Vaults" }).click();

  await fillForm(page, "Create agent vault", {
    name: "Support agent budget",
    agentLabel: "SupportBot",
    budgetAmount: "100.00",
    singleSpendLimit: "5.00",
    allowedRecipients: allowedRecipient
  });
  await submitForm(page, "Create agent vault");

  await expect(page.getByText("Agent vault created")).toBeVisible();
  await expect(page.locator(".vault-row").filter({ hasText: "Support agent budget" })).toBeVisible();

  await fillForm(page, "Create spend from Support agent budget", {
    recipientAddress: allowedRecipient,
    amount: "4.50",
    memo: "API task completed"
  });
  await submitForm(page, "Create spend from Support agent budget");

  await expect(page.getByText("Agent spend intent created")).toBeVisible();
  await expect(page.getByRole("cell", { name: "SupportBot spend" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "4.50 USDC" })).toBeVisible();
});

async function mockArcFlowApi(context: BrowserContext) {
  const state: { intents: PaymentIntent[]; vaults: AgentVault[] } = {
    intents: [],
    vaults: []
  };

  await context.route("**/api/config", (route) =>
    route.fulfill({
      json: {
        chainId: 5042002,
        rpcUrl: "https://rpc.testnet.arc.network",
        explorerUrl: "https://explorer.testnet.arc.network",
        privyAppId: "privy-e2e",
        paymentRegistryAddress: "0x4444444444444444444444444444444444444444",
        agentVaultAddress: "0x5555555555555555555555555555555555555555",
        tokens: {
          USDC: "0x6666666666666666666666666666666666666666",
          EURC: "0x7777777777777777777777777777777777777777"
        }
      }
    })
  );

  await context.route("**/api/payment-intents", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { intents: state.intents } });
      return;
    }

    const input = route.request().postDataJSON() as Partial<PaymentIntent> & {
      payerEmail?: string;
      recipientAddress?: string;
      dueAt?: string;
      sourceChainId?: number;
    };
    const intent = createIntent({
      amount: input.amount ?? "0",
      currency: input.currency ?? "USDC",
      description: input.description ?? null,
      due_at: input.dueAt ?? null,
      metadata: input.metadata ?? {},
      payer_email: input.payerEmail ?? null,
      recipient_address: input.recipientAddress ?? recipientAddress,
      source: input.source ?? "invoice",
      source_chain_id: input.sourceChainId ?? null,
      title: input.title ?? "Untitled"
    });
    state.intents = [intent, ...state.intents];
    await route.fulfill({ status: 201, json: { intent } });
  });

  await context.route("**/api/payment-intents/*", async (route) => {
    const id = route.request().url().split("/").pop();
    const input = route.request().postDataJSON() as { status?: PaymentIntent["status"]; onchainIntentId?: string; txHash?: string };
    const intent = state.intents.find((item) => item.id === id);
    if (!intent) {
      await route.fulfill({ status: 404, json: { error: { message: "Payment intent not found" } } });
      return;
    }

    Object.assign(intent, {
      status: input.status ?? intent.status,
      onchain_intent_id: input.onchainIntentId ?? intent.onchain_intent_id,
      tx_hash: input.txHash ?? intent.tx_hash,
      updated_at: timestamp()
    });
    await route.fulfill({ json: { intent } });
  });

  await context.route("**/api/checkout/*", async (route) => {
    const slug = route.request().url().split("/").pop();
    const intent = state.intents.find((item) => item.slug === slug);
    await fulfillMaybeFound(route, intent, { intent });
  });

  await context.route("**/api/agent-vaults", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { vaults: state.vaults } });
      return;
    }

    const input = route.request().postDataJSON() as {
      name?: string;
      agentLabel?: string;
      currency?: "USDC" | "EURC";
      budgetAmount?: string;
      singleSpendLimit?: string;
      allowedRecipients?: string[];
      policy?: Record<string, unknown>;
    };
    const vault = createVault(input);
    state.vaults = [vault, ...state.vaults];
    await route.fulfill({ status: 201, json: { vault } });
  });

  await context.route("**/api/agent-vaults/*/spend", async (route) => {
    const parts = new URL(route.request().url()).pathname.split("/");
    const vaultId = parts[parts.indexOf("agent-vaults") + 1];
    const vault = state.vaults.find((item) => item.id === vaultId);
    if (!vault) {
      await route.fulfill({ status: 404, json: { error: { message: "Agent vault not found" } } });
      return;
    }

    const input = route.request().postDataJSON() as { recipientAddress?: string; amount?: string; memo?: string };
    const intent = createIntent({
      amount: input.amount ?? "0",
      currency: vault.currency,
      description: input.memo ?? null,
      due_at: null,
      metadata: { vaultId: vault.id, policy: vault.policy },
      payer_email: null,
      recipient_address: input.recipientAddress ?? recipientAddress,
      source: "agent",
      source_chain_id: null,
      title: `${vault.agent_label} spend`
    });
    state.intents = [intent, ...state.intents];
    await route.fulfill({ status: 201, json: { intent } });
  });
}

function createIntent(input: Pick<PaymentIntent, "amount" | "currency" | "description" | "due_at" | "metadata" | "payer_email" | "recipient_address" | "source" | "source_chain_id" | "title">): PaymentIntent {
  const id = `${input.source}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return {
    id,
    owner_id: "profile-e2e",
    slug: `${input.source === "checkout" ? "chk" : input.source === "agent" ? "agent" : "inv"}-${id.slice(-8)}`,
    status: "created",
    onchain_intent_id: "42",
    tx_hash: null,
    paid_at: null,
    settlement_chain_id: 5042002,
    created_at: timestamp(),
    updated_at: timestamp(),
    ...input
  };
}

function createVault(input: {
  name?: string;
  agentLabel?: string;
  currency?: "USDC" | "EURC";
  budgetAmount?: string;
  singleSpendLimit?: string;
  allowedRecipients?: string[];
  policy?: Record<string, unknown>;
}): AgentVault {
  const id = `vault-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return {
    id,
    owner_id: "profile-e2e",
    name: input.name ?? "Agent vault",
    agent_label: input.agentLabel ?? "Agent",
    vault_address: null,
    currency: input.currency ?? "USDC",
    budget_amount: input.budgetAmount ?? "0",
    spent_amount: "0",
    single_spend_limit: input.singleSpendLimit ?? "0",
    allowed_recipients: input.allowedRecipients ?? [],
    status: "active",
    policy: input.policy ?? {},
    created_at: timestamp(),
    updated_at: timestamp()
  };
}

async function fulfillMaybeFound(route: Route, item: unknown, json: unknown) {
  if (!item) {
    await route.fulfill({ status: 404, json: { error: { message: "Not found" } } });
    return;
  }

  await route.fulfill({ json });
}

function timestamp() {
  return new Date("2026-05-14T00:00:00.000Z").toISOString();
}

async function fillForm(page: Page, heading: string, values: Record<string, string>) {
  await page.evaluate(
    ({ heading: targetHeading, values: nextValues }) => {
      const forms = Array.from(document.querySelectorAll<HTMLFormElement>("form"));
      const form = forms.find((candidate) => candidate.querySelector("h2")?.textContent === targetHeading);
      if (!form) throw new Error(`Missing form ${targetHeading}`);
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (!valueSetter) throw new Error("Unable to set input values");

      for (const [name, value] of Object.entries(nextValues)) {
        const input = form.elements.namedItem(name) as HTMLInputElement | null;
        if (!input) throw new Error(`Missing input ${name}`);
        valueSetter.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    },
    { heading, values }
  );
}

async function submitForm(page: Page, heading: string) {
  await page.evaluate((targetHeading) => {
    const forms = Array.from(document.querySelectorAll<HTMLFormElement>("form"));
    const form = forms.find((candidate) => candidate.querySelector("h2")?.textContent === targetHeading);
    if (!form) throw new Error(`Missing form ${targetHeading}`);
    form.requestSubmit();
  }, heading);
}

async function clickByTitle(page: Page, title: string) {
  await page.evaluate((targetTitle) => {
    const button = document.querySelector<HTMLButtonElement>(`button[title="${targetTitle}"]`);
    if (!button) throw new Error(`Missing button ${targetTitle}`);
    button.click();
  }, title);
}
