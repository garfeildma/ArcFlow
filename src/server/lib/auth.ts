import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Context, Next } from "hono";
import type { AuthUser, Env, Profile } from "../types";
import { SupabaseRest } from "./supabase";
import { jsonError } from "./http";

type Variables = {
  user: AuthUser;
  profile: Profile;
};

export type AppContext = Context<{ Bindings: Env; Variables: Variables }>;

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export async function authMiddleware(c: AppContext, next: Next) {
  const header = c.req.header("Authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) return jsonError(c, 401, "Missing bearer token");

  try {
    const user = await verifyPrivyToken(c.env, token);
    const profile = await upsertProfile(c.env, user);
    c.set("user", user);
    c.set("profile", profile);
    await next();
  } catch (error) {
    return jsonError(c, 401, "Invalid authentication token", error instanceof Error ? error.message : error);
  }
}

export async function verifyPrivyToken(env: Env, token: string): Promise<AuthUser> {
  const appId = env.PRIVY_APP_ID;
  const jwksUrl = new URL(`https://auth.privy.io/api/v1/apps/${appId}/jwks.json`);
  const cacheKey = jwksUrl.toString();
  const jwks = jwksCache.get(cacheKey) ?? createRemoteJWKSet(jwksUrl);
  jwksCache.set(cacheKey, jwks);

  const { payload } = await jwtVerify(token, jwks, {
    issuer: "privy.io",
    audience: appId
  });

  const linkedAccounts = Array.isArray(payload.linked_accounts) ? payload.linked_accounts : [];
  const wallet = linkedAccounts.find((account): account is { type: string; address: string } => {
    return Boolean(
      account &&
        typeof account === "object" &&
        "type" in account &&
        "address" in account &&
        account.type === "wallet" &&
        typeof account.address === "string"
    );
  });
  const emailAccount = linkedAccounts.find((account): account is { type: string; address: string } => {
    return Boolean(
      account &&
        typeof account === "object" &&
        "type" in account &&
        "address" in account &&
        account.type === "email" &&
        typeof account.address === "string"
    );
  });

  return {
    privyUserId: String(payload.sub),
    walletAddress: wallet?.address,
    email: emailAccount?.address
  };
}

async function upsertProfile(env: Env, user: AuthUser) {
  const db = new SupabaseRest(env);
  const [profile] = await db.upsert<Profile>("profiles", {
    privy_user_id: user.privyUserId,
    ...(user.walletAddress ? { wallet_address: user.walletAddress } : {}),
    ...(user.email ? { email: user.email } : {})
  }, "privy_user_id");

  return profile;
}
