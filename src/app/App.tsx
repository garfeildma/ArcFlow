import { useCallback, useEffect, useMemo, useState } from "react";
import { usePrivy, useSendTransaction } from "@privy-io/react-auth";
import { ArrowUpRight, Bot, Check, Copy, FileText, Link2, Loader2, LogIn, Plus, Receipt, RefreshCw, ShieldCheck, Wallet } from "lucide-react";
import { encodeApprove, encodeCreateIntent, encodePayIntent, registryAddress, tokenAddress } from "./lib/chain";
import { endpoints } from "./lib/api";
import type { AgentVault, AppConfig, PaymentIntent } from "./lib/types";
import { EmptyState } from "./components/EmptyState";
import { StatusPill } from "./components/StatusPill";

type View = "dashboard" | "invoices" | "checkout" | "agents";

const navItems: Array<{ id: View; label: string; icon: typeof Receipt }> = [
  { id: "dashboard", label: "Dashboard", icon: Receipt },
  { id: "invoices", label: "Invoices", icon: FileText },
  { id: "checkout", label: "Checkout", icon: Link2 },
  { id: "agents", label: "Agent Vaults", icon: Bot }
];

export function App() {
  const { ready, authenticated, login, logout, getAccessToken, user } = usePrivy();
  const { sendTransaction } = useSendTransaction();
  const [view, setView] = useState<View>("dashboard");
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [intents, setIntents] = useState<PaymentIntent[]>([]);
  const [vaults, setVaults] = useState<AgentVault[]>([]);
  const [notice, setNotice] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const walletAddress = user?.wallet?.address;
  const checkoutSlug = location.pathname.startsWith("/checkout/") ? location.pathname.split("/checkout/")[1] : "";

  const refresh = useCallback(async () => {
    const cfg = await endpoints.config();
    setConfig(cfg);
    if (!authenticated) return;
    const token = await getAccessToken();
    if (!token) return;
    const [intentRes, vaultRes] = await Promise.all([endpoints.intents(token), endpoints.vaults(token)]);
    setIntents(intentRes.intents);
    setVaults(vaultRes.vaults);
  }, [authenticated, getAccessToken]);

  useEffect(() => {
    refresh().catch((error) => setNotice(error instanceof Error ? error.message : "Unable to load app data"));
  }, [refresh]);

  const stats = useMemo(() => {
    const paid = intents.filter((intent) => intent.status === "paid");
    const open = intents.filter((intent) => intent.status === "created" || intent.status === "pending");
    const received = paid.reduce((sum, intent) => sum + Number(intent.amount), 0);
    return {
      received,
      open: open.length,
      vaults: vaults.filter((vault) => vault.status === "active").length,
      payments: intents.length
    };
  }, [intents, vaults]);

  async function createIntent(payload: Record<string, unknown>) {
    const token = await getAccessToken();
    if (!token) throw new Error("Sign in first");
    setBusy(true);
    try {
      const { intent } = await endpoints.createIntent(token, payload);
      setIntents((items) => [intent, ...items]);
      setNotice("Payment intent created");
      return intent;
    } finally {
      setBusy(false);
    }
  }

  async function createVault(payload: Record<string, unknown>) {
    const token = await getAccessToken();
    if (!token) throw new Error("Sign in first");
    setBusy(true);
    try {
      const { vault } = await endpoints.createVault(token, payload);
      setVaults((items) => [vault, ...items]);
      setNotice("Agent vault created");
    } finally {
      setBusy(false);
    }
  }

  async function updateIntent(id: string, payload: Record<string, unknown>) {
    const token = await getAccessToken();
    if (!token) throw new Error("Sign in first");
    const { intent } = await endpoints.updateIntent(token, id, payload);
    setIntents((items) => items.map((item) => (item.id === id ? intent : item)));
    return intent;
  }

  async function createOnchainIntent(intent: PaymentIntent) {
    if (!config) throw new Error("Config not loaded");
    const hash = await sendTransaction({
      to: registryAddress(config),
      data: encodeCreateIntent(config, intent),
      chainId: config.chainId
    });
    await updateIntent(intent.id, { status: "pending", txHash: hash.hash });
    setNotice("Create transaction sent");
  }

  async function payOnchainIntent(intent: PaymentIntent) {
    if (!config) throw new Error("Config not loaded");
    if (!intent.onchain_intent_id) throw new Error("Run the indexer or set onchain intent id before paying");
    const approve = await sendTransaction({
      to: tokenAddress(config, intent.currency),
      data: encodeApprove(config, intent),
      chainId: config.chainId
    });
    setNotice(`Approval sent: ${approve.hash}`);
    const paid = await sendTransaction({
      to: registryAddress(config),
      data: encodePayIntent(config, BigInt(intent.onchain_intent_id)),
      chainId: config.chainId
    });
    await updateIntent(intent.id, { status: "pending", txHash: paid.hash });
    setNotice("Payment transaction sent");
  }

  async function guarded(action: () => Promise<void>) {
    setBusy(true);
    setNotice("");
    try {
      await action();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  const body = checkoutSlug ? (
    <CheckoutPage slug={checkoutSlug} />
  ) : !ready ? (
    <LoadingSurface />
  ) : !authenticated ? (
    <Welcome onLogin={login} />
  ) : (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Arc testnet operations</p>
          <h1>ArcFlow</h1>
        </div>
        <div className="wallet-box">
          <span>{short(walletAddress || "No wallet")}</span>
          <button className="ghost-button" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      <main className="workspace">
        <aside className="sidebar">
          <div className="brand-mark">AF</div>
          <nav>
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}>
                  <Icon size={18} />
                  {item.label}
                </button>
              );
            })}
          </nav>
          <div className="chain-panel">
            <span>Arc Testnet</span>
            <strong>{config?.chainId || 5042002}</strong>
          </div>
        </aside>

        <section className="content">
          <div className="content-actions">
            <button className="ghost-button" onClick={() => guarded(refresh)}>
              {busy ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
              Refresh
            </button>
          </div>
          {notice && <div className="notice">{notice}</div>}

          {view === "dashboard" && <Dashboard stats={stats} intents={intents} vaults={vaults} />}
          {view === "invoices" && (
            <Invoices
              busy={busy}
              walletAddress={walletAddress}
              intents={intents.filter((intent) => intent.source === "invoice")}
              onCreate={(payload) => guarded(async () => void (await createIntent({ ...payload, source: "invoice" })))}
              onCreateChain={(intent) => guarded(() => createOnchainIntent(intent))}
              onPayChain={(intent) => guarded(() => payOnchainIntent(intent))}
            />
          )}
          {view === "checkout" && (
            <Checkout
              busy={busy}
              walletAddress={walletAddress}
              intents={intents.filter((intent) => intent.source === "checkout")}
              onCreate={(payload) => guarded(async () => void (await createIntent({ ...payload, source: "checkout", metadata: { route: "cross-chain-usdc" } })))}
              onCopy={(text) => copy(text, setNotice)}
            />
          )}
          {view === "agents" && (
            <Agents
              busy={busy}
              vaults={vaults}
              intents={intents.filter((intent) => intent.source === "agent")}
              onCreateVault={(payload) => guarded(() => createVault(payload))}
              onAgentSpend={(vaultId, payload) =>
                guarded(async () => {
                  const token = await getAccessToken();
                  if (!token) throw new Error("Sign in first");
                  const { intent } = await endpoints.agentSpend(token, vaultId, payload);
                  setIntents((items) => [intent, ...items]);
                  setNotice("Agent spend intent created");
                })
              }
            />
          )}
        </section>
      </main>
    </>
  );

  return <div className="app-shell">{body}</div>;
}

function CheckoutPage({ slug }: { slug: string }) {
  const { ready, authenticated, login } = usePrivy();
  const { sendTransaction } = useSendTransaction();
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [intent, setIntent] = useState<PaymentIntent | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([endpoints.config(), endpoints.checkout(slug)])
      .then(([cfg, res]) => {
        setConfig(cfg);
        setIntent(res.intent);
      })
      .catch((error) => setNotice(error instanceof Error ? error.message : "Unable to load checkout"));
  }, [slug]);

  async function pay() {
    if (!intent || !config) return;
    if (!authenticated) {
      login();
      return;
    }
    if (!intent.onchain_intent_id) {
      setNotice("This checkout link is ready, but its on-chain intent id has not been indexed yet.");
      return;
    }
    setBusy(true);
    try {
      const approve = await sendTransaction({
        to: tokenAddress(config, intent.currency),
        data: encodeApprove(config, intent),
        chainId: config.chainId
      });
      setNotice(`Approval sent: ${approve.hash}`);
      const paid = await sendTransaction({
        to: registryAddress(config),
        data: encodePayIntent(config, BigInt(intent.onchain_intent_id)),
        chainId: config.chainId
      });
      setNotice(`Payment sent: ${paid.hash}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Payment failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="public-checkout">
      <div className="checkout-receipt">
        <p className="eyebrow">ArcFlow checkout</p>
        <h1>{intent?.title || "Payment link"}</h1>
        {intent ? (
          <>
            <div className="checkout-amount">
              {intent.amount} <span>{intent.currency}</span>
            </div>
            <dl>
              <div>
                <dt>Status</dt>
                <dd>
                  <StatusPill status={intent.status} />
                </dd>
              </div>
              <div>
                <dt>Settlement</dt>
                <dd>Arc testnet</dd>
              </div>
              <div>
                <dt>Recipient</dt>
                <dd>{short(intent.recipient_address)}</dd>
              </div>
            </dl>
            <button className="primary-button wide" disabled={!ready || busy || intent.status === "paid"} onClick={pay}>
              {busy ? <Loader2 className="spin" size={18} /> : <Wallet size={18} />}
              {authenticated ? "Pay with USDC" : "Sign in to pay"}
            </button>
          </>
        ) : (
          <LoadingSurface />
        )}
        {notice && <div className="notice">{notice}</div>}
      </div>
    </section>
  );
}

function Welcome({ onLogin }: { onLogin: () => void }) {
  return (
    <section className="welcome">
      <div className="welcome-copy">
        <p className="eyebrow">USDC operations on Arc</p>
        <h1>ArcFlow</h1>
        <p>Issue invoices, run hosted checkout, and control AI agent spending from one stablecoin workspace.</p>
        <button className="primary-button" onClick={onLogin}>
          <LogIn size={18} />
          Sign in with Privy
        </button>
      </div>
      <div className="welcome-visual">
        <div className="flow-line" />
        <div className="node node-a">Invoice</div>
        <div className="node node-b">Checkout</div>
        <div className="node node-c">Agent Vault</div>
      </div>
    </section>
  );
}

function LoadingSurface() {
  return (
    <div className="loading">
      <Loader2 className="spin" />
      Loading ArcFlow
    </div>
  );
}

function Dashboard({ stats, intents, vaults }: { stats: { received: number; open: number; vaults: number; payments: number }; intents: PaymentIntent[]; vaults: AgentVault[] }) {
  return (
    <div className="panel-stack">
      <div className="metric-grid">
        <Metric label="Received" value={`$${stats.received.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} />
        <Metric label="Open intents" value={stats.open.toString()} />
        <Metric label="Active vaults" value={stats.vaults.toString()} />
        <Metric label="Total payments" value={stats.payments.toString()} />
      </div>
      <div className="two-column">
        <section>
          <h2>Recent payment intents</h2>
          <IntentTable intents={intents.slice(0, 6)} />
        </section>
        <section>
          <h2>Agent budgets</h2>
          {vaults.length ? (
            <div className="vault-list">
              {vaults.slice(0, 4).map((vault) => (
                <div className="vault-row" key={vault.id}>
                  <div>
                    <strong>{vault.name}</strong>
                    <span>{vault.agent_label}</span>
                  </div>
                  <p>
                    {vault.spent_amount} / {vault.budget_amount} {vault.currency}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No vaults yet" detail="Create an agent budget from Agent Vaults." />
          )}
        </section>
      </div>
    </div>
  );
}

function Invoices({
  busy,
  walletAddress,
  intents,
  onCreate,
  onCreateChain,
  onPayChain
}: {
  busy: boolean;
  walletAddress?: string;
  intents: PaymentIntent[];
  onCreate: (payload: Record<string, unknown>) => void;
  onCreateChain: (intent: PaymentIntent) => void;
  onPayChain: (intent: PaymentIntent) => void;
}) {
  return (
    <div className="panel-stack">
      <FormPanel
        title="Create invoice"
        fields={[
          ["title", "Invoice title", "Design retainer"],
          ["amount", "Amount", "250.00"],
          ["payerEmail", "Payer email", "finance@example.com"],
          ["recipientAddress", "Recipient address", walletAddress || "0x..."]
        ]}
        submitLabel="Create invoice"
        busy={busy}
        onSubmit={(values) => onCreate({ ...values, currency: "USDC" })}
      />
      <section>
        <h2>Invoices</h2>
        <IntentTable intents={intents} actions={(intent) => <IntentActions intent={intent} onCreateChain={onCreateChain} onPayChain={onPayChain} />} />
      </section>
    </div>
  );
}

function Checkout({
  busy,
  walletAddress,
  intents,
  onCreate,
  onCopy
}: {
  busy: boolean;
  walletAddress?: string;
  intents: PaymentIntent[];
  onCreate: (payload: Record<string, unknown>) => void;
  onCopy: (text: string) => void;
}) {
  return (
    <div className="panel-stack">
      <section className="checkout-band">
        <div>
          <h2>Hosted checkout</h2>
          <p>Generate a customer-facing payment URL that settles USDC or EURC to Arc.</p>
        </div>
        <ShieldCheck size={28} />
      </section>
      <FormPanel
        title="Create checkout link"
        fields={[
          ["title", "Checkout title", "API credits"],
          ["amount", "Amount", "50.00"],
          ["recipientAddress", "Settlement address", walletAddress || "0x..."]
        ]}
        submitLabel="Create checkout"
        busy={busy}
        onSubmit={(values) => onCreate({ ...values, currency: "USDC" })}
      />
      <section>
        <h2>Checkout links</h2>
        <IntentTable
          intents={intents}
          actions={(intent) => (
            <button className="icon-button" onClick={() => onCopy(`${location.origin}/checkout/${intent.slug}`)} title="Copy checkout URL">
              <Copy size={16} />
            </button>
          )}
        />
      </section>
    </div>
  );
}

function Agents({
  busy,
  vaults,
  intents,
  onCreateVault,
  onAgentSpend
}: {
  busy: boolean;
  vaults: AgentVault[];
  intents: PaymentIntent[];
  onCreateVault: (payload: Record<string, unknown>) => void;
  onAgentSpend: (vaultId: string, payload: Record<string, unknown>) => void;
}) {
  const firstVault = vaults[0];
  return (
    <div className="panel-stack">
      <FormPanel
        title="Create agent vault"
        fields={[
          ["name", "Vault name", "Support agent budget"],
          ["agentLabel", "Agent label", "SupportBot"],
          ["budgetAmount", "Budget", "100.00"],
          ["singleSpendLimit", "Single spend limit", "5.00"],
          ["allowedRecipients", "Allowed recipient", "0x..."]
        ]}
        submitLabel="Create vault"
        busy={busy}
        onSubmit={(values) =>
          onCreateVault({
            ...values,
            currency: "USDC",
            allowedRecipients: values.allowedRecipients ? [values.allowedRecipients] : [],
            policy: { mode: "single-recipient", review: "offchain" }
          })
        }
      />
      {firstVault && (
        <FormPanel
          title={`Create spend from ${firstVault.name}`}
          fields={[
            ["recipientAddress", "Recipient address", firstVault.allowed_recipients[0] || "0x..."],
            ["amount", "Amount", firstVault.single_spend_limit],
            ["memo", "Memo", "API task completed"]
          ]}
          submitLabel="Create agent spend"
          busy={busy}
          onSubmit={(values) => onAgentSpend(firstVault.id, values)}
        />
      )}
      <section>
        <h2>Vaults</h2>
        {vaults.length ? (
          <div className="vault-list">
            {vaults.map((vault) => (
              <div className="vault-row" key={vault.id}>
                <div>
                  <strong>{vault.name}</strong>
                  <span>{vault.allowed_recipients.length ? vault.allowed_recipients.map(short).join(", ") : "No recipients configured"}</span>
                </div>
                <p>
                  Limit {vault.single_spend_limit} {vault.currency}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No agent vaults" detail="Create a budget and allowed-recipient policy." />
        )}
      </section>
      <section>
        <h2>Agent payment intents</h2>
        <IntentTable intents={intents} />
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function FormPanel({
  title,
  fields,
  submitLabel,
  busy,
  onSubmit
}: {
  title: string;
  fields: Array<[string, string, string]>;
  submitLabel: string;
  busy: boolean;
  onSubmit: (values: Record<string, string>) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});

  return (
    <form
      className="form-panel"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(Object.fromEntries(fields.map(([name]) => [name, values[name] || ""])));
      }}
    >
      <h2>{title}</h2>
      <div className="form-grid">
        {fields.map(([name, label, placeholder]) => (
          <label key={name}>
            {label}
            <input
              name={name}
              data-testid={`form-field-${name}`}
              value={values[name] || ""}
              placeholder={placeholder}
              onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))}
            />
          </label>
        ))}
      </div>
      <button className="primary-button" disabled={busy}>
        {busy ? <Loader2 className="spin" size={16} /> : <Plus size={16} />}
        {submitLabel}
      </button>
    </form>
  );
}

function IntentTable({ intents, actions }: { intents: PaymentIntent[]; actions?: (intent: PaymentIntent) => React.ReactNode }) {
  if (!intents.length) return <EmptyState title="No payment intents" detail="Create one from the form above." />;
  return (
    <div className="table-shell">
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Recipient</th>
            <th>Link</th>
            {actions && <th />}
          </tr>
        </thead>
        <tbody>
          {intents.map((intent) => (
            <tr key={intent.id}>
              <td>
                <strong>{intent.title}</strong>
                <span>{new Date(intent.created_at).toLocaleDateString()}</span>
              </td>
              <td>
                {intent.amount} {intent.currency}
              </td>
              <td>
                <StatusPill status={intent.status} />
              </td>
              <td>{short(intent.recipient_address)}</td>
              <td>
                <a href={`/checkout/${intent.slug}`} target="_blank" rel="noreferrer">
                  Open <ArrowUpRight size={14} />
                </a>
              </td>
              {actions && <td>{actions(intent)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IntentActions({ intent, onCreateChain, onPayChain }: { intent: PaymentIntent; onCreateChain: (intent: PaymentIntent) => void; onPayChain: (intent: PaymentIntent) => void }) {
  return (
    <div className="row-actions">
      <button className="icon-button" onClick={() => onCreateChain(intent)} title="Create intent on-chain">
        <Wallet size={16} />
      </button>
      <button className="icon-button" onClick={() => onPayChain(intent)} title="Approve and pay">
        <Check size={16} />
      </button>
    </div>
  );
}

async function copy(text: string, setNotice: (value: string) => void) {
  await navigator.clipboard.writeText(text);
  setNotice("Copied checkout URL");
}

function short(value: string) {
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}
