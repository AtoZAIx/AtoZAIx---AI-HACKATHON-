import "server-only";
import { cookies } from "next/headers";
import { MERCHANT_IDS } from "./directory";
import { hmac, safeEqual } from "./signing";
import type { MerchantId } from "./types";

/**
 * Merchant role sessions. A merchant signs in with its passcode and receives
 * a signed, httpOnly cookie scoped to its own merchant id. Every merchant API
 * route and page re-verifies it server-side; customer routes never read
 * merchant-confidential data at all.
 */
export const MERCHANT_COOKIE = "nexus_merchant";
const TTL_MS = 8 * 60 * 60 * 1000;

/** Development fallback passcode, used only outside production when no env passcode is set. */
export const DEV_PASSCODE = "nexus-dev";

export function passcodeFor(id: MerchantId): string | null {
  const fromEnv = process.env[`NEXUS_MERCHANT_PASSCODE_${id.toUpperCase()}`];
  if (fromEnv) return fromEnv;
  return process.env.NODE_ENV === "production" ? null : DEV_PASSCODE;
}

export function devPasscodeActive(): boolean {
  return process.env.NODE_ENV !== "production" && MERCHANT_IDS.some((id) => !process.env[`NEXUS_MERCHANT_PASSCODE_${id.toUpperCase()}`]);
}

export function checkPasscode(id: MerchantId, passcode: string): boolean {
  const expected = passcodeFor(id);
  return Boolean(expected) && safeEqual(expected!, passcode);
}

export function issueToken(id: MerchantId, now = Date.now()): string {
  const exp = now + TTL_MS;
  return `${id}.${exp}.${hmac(`merchant|${id}|${exp}`)}`;
}

export function readToken(token: string | undefined, now = Date.now()): MerchantId | null {
  if (!token) return null;
  const [id, exp, sig] = token.split(".");
  if (!id || !exp || !sig || !MERCHANT_IDS.includes(id as MerchantId)) return null;
  if (Number(exp) < now) return null;
  return safeEqual(sig, hmac(`merchant|${id}|${exp}`)) ? (id as MerchantId) : null;
}

export async function currentMerchant(): Promise<MerchantId | null> {
  const jar = await cookies();
  return readToken(jar.get(MERCHANT_COOKIE)?.value);
}

export function cookieOptions() {
  return { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: TTL_MS / 1000 };
}
