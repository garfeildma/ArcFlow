import type { Env } from "../types";

type QueryValue = string | number | boolean | null | undefined;

export class SupabaseRest {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(env: Env) {
    this.baseUrl = env.SUPABASE_URL.replace(/\/$/, "");
    this.apiKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!this.apiKey) {
      throw new Error("SUPABASE_SECRET_KEY is required");
    }
  }

  async select<T>(table: string, params: Record<string, QueryValue> = {}) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) search.set(key, String(value));
    }
    const path = `${table}${search.size ? `?${search.toString()}` : ""}`;
    return this.request<T[]>("GET", path);
  }

  async insert<T>(table: string, body: Record<string, unknown>) {
    return this.request<T[]>("POST", table, body, {
      Prefer: "return=representation"
    });
  }

  async update<T>(table: string, filter: string, body: Record<string, unknown>) {
    return this.request<T[]>("PATCH", `${table}?${filter}`, body, {
      Prefer: "return=representation"
    });
  }

  async upsert<T>(table: string, body: Record<string, unknown>, onConflict: string) {
    return this.request<T[]>("POST", `${table}?on_conflict=${onConflict}`, body, {
      Prefer: "resolution=merge-duplicates,return=representation"
    });
  }

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
    extraHeaders: Record<string, string> = {}
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: this.apiKey,
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...extraHeaders
      },
      body: body ? JSON.stringify(body) : undefined
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Supabase ${method} ${path} failed: ${res.status} ${text}`);
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
}
