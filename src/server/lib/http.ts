import type { Context } from "hono";

export function jsonError(c: Context, status: number, message: string, details?: unknown) {
  return c.json({ error: { message, details } }, status as never);
}

export async function readJson<T>(c: Context): Promise<T> {
  try {
    return (await c.req.json()) as T;
  } catch {
    throw new Error("Request body must be valid JSON");
  }
}

export function randomSlug(prefix: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const suffix = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${suffix}`;
}

export function assertAddress(value: string, field = "address"): asserts value is `0x${string}` {
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`${field} must be an EVM address`);
  }
}

export function assertPositiveAmount(value: string) {
  if (!/^\d+(\.\d{1,6})?$/.test(value) || Number(value) <= 0) {
    throw new Error("amount must be a positive decimal string with up to 6 decimals");
  }
}
