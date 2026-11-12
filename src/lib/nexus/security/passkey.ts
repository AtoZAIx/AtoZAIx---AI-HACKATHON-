import "server-only";
import { createHash, createPublicKey, randomBytes, verify as verifySignature, type KeyObject } from "node:crypto";
import { hmac, safeEqual } from "../signing";
import type { PasskeyAssertionJSON, PasskeyRegistrationJSON } from "../step-up";

/**
 * Passkeys (WebAuthn) for step-up approval, verified here with Node's own
 * crypto. Only the public key is kept, in a signed HttpOnly cookie on the
 * customer's device: no account, no password and no email.
 *
 * Checks on every ceremony: the one-time challenge, the page origin, the
 * relying-party ID hash, user presence AND user verification (biometrics or
 * device PIN), the signature, and a rising signature counter.
 */

export const PASSKEY_COOKIE = "nx_passkey";
export const CHALLENGE_COOKIE = "nx_pk_challenge";
const CHALLENGE_TTL_MS = 5 * 60_000;
const ALGORITHMS = { ES256: -7, RS256: -257 } as const;

export class PasskeyError extends Error {
  readonly status = 403;
}

export interface StoredPasskey {
  v: 1;
  /** Credential ID, base64url. */
  id: string;
  /** SubjectPublicKeyInfo DER, base64url. */
  publicKey: string;
  alg: number;
  counter: number;
  createdAt: string;
}

interface Challenge {
  c: string;
  purpose: "register" | "approve";
  /** Approvals: the exact order, amount and terms the passkey confirms. */
  orderId?: string;
  amountCents?: number;
  termsHash?: string;
  exp: number;
}

const b64u = (b: Buffer) => b.toString("base64url");
const unb64u = (s: unknown): Buffer => {
  if (typeof s !== "string" || !/^[A-Za-z0-9_-]*$/.test(s) || s.length > 8192) throw new PasskeyError("Malformed passkey response");
  return Buffer.from(s, "base64url");
};
const sha256 = (b: Buffer | string) => createHash("sha256").update(b).digest();

/** A value the server signed, so the browser can carry it but not change it. */
export function seal(value: object): string {
  const body = b64u(Buffer.from(JSON.stringify(value)));
  return `${body}.${hmac(`passkey|${body}`)}`;
}

export function unseal<T>(token: string | undefined | null): T | null {
  if (!token || token.length > 4096) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac || !safeEqual(mac, hmac(`passkey|${body}`))) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

/** A fresh one-time challenge, bound (for approvals) to the exact order, amount and terms. */
export function newChallenge(purpose: Challenge["purpose"], bind: Pick<Challenge, "orderId" | "amountCents" | "termsHash"> = {}, now = Date.now()) {
  const c = b64u(randomBytes(32));
  return { challenge: c, token: seal({ c, purpose, ...bind, exp: now + CHALLENGE_TTL_MS } satisfies Challenge) };
}

const used = (globalThis as unknown as { __nexusPasskeyChallenges?: Map<string, number> }).__nexusPasskeyChallenges ?? new Map<string, number>();
(globalThis as unknown as { __nexusPasskeyChallenges?: Map<string, number> }).__nexusPasskeyChallenges = used;

/** Each challenge works once, so a captured response can't be replayed. */
function spend(c: Challenge, now: number) {
  for (const [k, exp] of used) if (exp < now) used.delete(k);
  if (used.has(c.c)) throw new PasskeyError("This passkey check was already used. Try again.");
  used.set(c.c, c.exp);
}

function readChallenge(token: string | undefined, purpose: Challenge["purpose"], now: number): Challenge {
  const c = unseal<Challenge>(token);
  if (!c || c.purpose !== purpose) throw new PasskeyError("Passkey check expired. Try again.");
  if (c.exp < now) throw new PasskeyError("Passkey check expired. Try again.");
  return c;
}

/** Client data and authenticator data checks shared by set-up and approval. */
function checkCeremony(type: "webauthn.create" | "webauthn.get", clientDataJSON: Buffer, authData: Buffer, challenge: string, origin: string) {
  let client: { type?: string; challenge?: string; origin?: string; crossOrigin?: boolean };
  try {
    client = JSON.parse(clientDataJSON.toString("utf8"));
  } catch {
    throw new PasskeyError("Malformed passkey response");
  }
  if (client.type !== type) throw new PasskeyError("Wrong kind of passkey response");
  if (typeof client.challenge !== "string" || !safeEqual(client.challenge, challenge)) throw new PasskeyError("Passkey response doesn't match this check");
  if (client.origin !== origin || client.crossOrigin === true) throw new PasskeyError("Passkey response came from another site");
  if (authData.length < 37) throw new PasskeyError("Malformed passkey response");
  const rpId = new URL(origin).hostname;
  if (!sha256(rpId).equals(authData.subarray(0, 32))) throw new PasskeyError("Passkey belongs to another site");
  const flags = authData[32];
  if (!(flags & 0x01)) throw new PasskeyError("Passkey didn't confirm you were present");
  if (!(flags & 0x04)) throw new PasskeyError("Passkey didn't verify you (Face ID, fingerprint or PIN)");
  return { counter: authData.readUInt32BE(33) };
}

function keyFor(alg: number, spki: Buffer): KeyObject {
  let key: KeyObject;
  try {
    key = createPublicKey({ key: spki, format: "der", type: "spki" });
  } catch {
    throw new PasskeyError("Passkey public key isn't valid");
  }
  const ok = (alg === ALGORITHMS.ES256 && key.asymmetricKeyType === "ec" && key.asymmetricKeyDetails?.namedCurve === "prime256v1") || (alg === ALGORITHMS.RS256 && key.asymmetricKeyType === "rsa");
  if (!ok) throw new PasskeyError("Passkey type isn't supported");
  return key;
}

/** Verifies a passkey set-up and returns what to keep (public key only). */
export function verifyRegistration(input: { challengeToken: string | undefined; response: PasskeyRegistrationJSON; origin: string; now?: number }): StoredPasskey {
  const now = input.now ?? Date.now();
  const c = readChallenge(input.challengeToken, "register", now);
  const r = input.response;
  const { counter } = checkCeremony("webauthn.create", unb64u(r.clientDataJSON), unb64u(r.authenticatorData), c.c, input.origin);
  const spki = unb64u(r.publicKey);
  keyFor(r.publicKeyAlgorithm, spki);
  const id = unb64u(r.id);
  if (id.length < 16 || id.length > 1023) throw new PasskeyError("Passkey ID isn't valid");
  spend(c, now);
  return { v: 1, id: b64u(id), publicKey: b64u(spki), alg: r.publicKeyAlgorithm, counter, createdAt: new Date(now).toISOString() };
}

/** Verifies a passkey approval for exactly this order, amount and terms. Returns the new signature counter. */
export function verifyApproval(input: {
  challengeToken: string | undefined;
  passkey: StoredPasskey | null;
  response: PasskeyAssertionJSON;
  origin: string;
  expect: { orderId: string; amountCents: number; termsHash: string };
  now?: number;
}): { counter: number } {
  const now = input.now ?? Date.now();
  if (!input.passkey) throw new PasskeyError("Set up a passkey on this device first.");
  const c = readChallenge(input.challengeToken, "approve", now);
  if (c.orderId !== input.expect.orderId || c.amountCents !== input.expect.amountCents || c.termsHash !== input.expect.termsHash) {
    throw new PasskeyError("This passkey check was for a different amount or order.");
  }
  const r = input.response;
  if (b64u(unb64u(r.id)) !== input.passkey.id) throw new PasskeyError("That isn't the passkey set up on this device.");
  const clientData = unb64u(r.clientDataJSON);
  const authData = unb64u(r.authenticatorData);
  const { counter } = checkCeremony("webauthn.get", clientData, authData, c.c, input.origin);
  // Authenticators that count must count up; a repeat or drop suggests a cloned key.
  if ((counter !== 0 || input.passkey.counter !== 0) && counter <= input.passkey.counter) throw new PasskeyError("Passkey counter went backwards. Set it up again.");
  const signed = Buffer.concat([authData, sha256(clientData)]);
  const ok = verifySignature("sha256", signed, keyFor(input.passkey.alg, unb64u(input.passkey.publicKey)), unb64u(r.signature));
  if (!ok) throw new PasskeyError("Passkey signature didn't verify.");
  spend(c, now);
  return { counter };
}

/** Browser options for a passkey set-up. */
export function registrationOptions(origin: string, challenge: string, existing: StoredPasskey | null) {
  return {
    challenge,
    rp: { name: "AtoZAIx", id: new URL(origin).hostname },
    user: { id: b64u(randomBytes(16)), name: "AtoZAIx shopper", displayName: "AtoZAIx shopper" },
    pubKeyCredParams: [
      { type: "public-key", alg: ALGORITHMS.ES256 },
      { type: "public-key", alg: ALGORITHMS.RS256 },
    ],
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
    attestation: "none",
    timeout: 60_000,
    excludeCredentials: existing ? [{ type: "public-key", id: existing.id }] : [],
  };
}

/** Browser options for a passkey approval. */
export function approvalOptions(origin: string, challenge: string, passkey: StoredPasskey) {
  return {
    challenge,
    rpId: new URL(origin).hostname,
    allowCredentials: [{ type: "public-key", id: passkey.id }],
    userVerification: "required",
    timeout: 60_000,
  };
}

/** The site's public address (the origin a passkey is tied to). Behind Render, the configured URL wins. */
export function publicOrigin(req: Request): string {
  const configured = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL;
  if (configured && /^https?:\/\/[^/\s]+$/.test(configured.replace(/\/+$/, ""))) return configured.replace(/\/+$/, "");
  return new URL(req.url).origin;
}

export const cookieOptions = (origin: string, maxAge: number) => ({ httpOnly: true, secure: origin.startsWith("https://"), sameSite: "strict" as const, path: "/", maxAge });
