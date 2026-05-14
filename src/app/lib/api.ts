import type { AgentVault, AppConfig, PaymentIntent } from "./types";

export async function apiGet<T>(path: string, token?: string) {
  const res = await fetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined
  });
  return parseResponse<T>(res);
}

export async function apiPost<T>(path: string, body: unknown, token?: string) {
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });
  return parseResponse<T>(res);
}

export async function apiPatch<T>(path: string, body: unknown, token?: string) {
  const res = await fetch(path, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });
  return parseResponse<T>(res);
}

async function parseResponse<T>(res: Response) {
  const data = (await res.json()) as T & { error?: { message: string; details?: unknown } };
  if (!res.ok) {
    throw new Error(data.error?.details ? `${data.error.message}: ${String(data.error.details)}` : data.error?.message || "Request failed");
  }
  return data;
}

export const endpoints = {
  config: () => apiGet<AppConfig>("/api/config"),
  intents: (token: string) => apiGet<{ intents: PaymentIntent[] }>("/api/payment-intents", token),
  createIntent: (token: string, body: unknown) => apiPost<{ intent: PaymentIntent }>("/api/payment-intents", body, token),
  updateIntent: (token: string, id: string, body: unknown) => apiPatch<{ intent: PaymentIntent }>(`/api/payment-intents/${id}`, body, token),
  checkout: (slug: string) => apiGet<{ intent: PaymentIntent }>(`/api/checkout/${slug}`),
  vaults: (token: string) => apiGet<{ vaults: AgentVault[] }>("/api/agent-vaults", token),
  createVault: (token: string, body: unknown) => apiPost<{ vault: AgentVault }>("/api/agent-vaults", body, token),
  agentSpend: (token: string, id: string, body: unknown) => apiPost<{ intent: PaymentIntent }>(`/api/agent-vaults/${id}/spend`, body, token)
};
