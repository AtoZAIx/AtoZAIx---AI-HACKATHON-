"use client";

import { api } from "./client";
import type { PasskeyAssertionJSON, PasskeyRegistrationJSON } from "./step-up";

/** Browser side of passkeys: Face ID, Touch ID, fingerprint or device PIN. Nothing secret leaves the device. */

const toB64u = (buf: ArrayBuffer) => {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64u = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

export const passkeysSupported = () => typeof window !== "undefined" && typeof window.PublicKeyCredential === "function" && Boolean(navigator.credentials);

/** Plain words for what went wrong (cancelled, timed out, not allowed here). */
function explain(err: unknown): Error {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError") return new Error("Passkey check was cancelled or timed out. Try again.");
  if (name === "InvalidStateError") return new Error("A passkey is already set up on this device.");
  if (name === "SecurityError") return new Error("Passkeys need a secure (https) page.");
  return err instanceof Error ? err : new Error("Passkey check failed");
}

type Desc = { type: "public-key"; id: string };

export async function passkeyStatus(): Promise<{ registered: boolean }> {
  return api<{ registered: boolean }>("/api/passkey");
}

/** One-time set-up on this device. */
export async function setUpPasskey(): Promise<void> {
  const { options: o } = await api<{
    options: {
      challenge: string;
      rp: PublicKeyCredentialRpEntity;
      user: { id: string; name: string; displayName: string };
      pubKeyCredParams: PublicKeyCredentialParameters[];
      authenticatorSelection: AuthenticatorSelectionCriteria;
      attestation: AttestationConveyancePreference;
      timeout: number;
      excludeCredentials: Desc[];
    };
  }>("/api/passkey/register/options", { method: "POST" });
  let cred: PublicKeyCredential;
  try {
    cred = (await navigator.credentials.create({
      publicKey: {
        ...o,
        challenge: fromB64u(o.challenge),
        user: { ...o.user, id: fromB64u(o.user.id) },
        excludeCredentials: o.excludeCredentials.map((c) => ({ type: c.type, id: fromB64u(c.id) })),
      },
    })) as PublicKeyCredential;
  } catch (err) {
    throw explain(err);
  }
  const r = cred.response as AuthenticatorAttestationResponse;
  const publicKey = r.getPublicKey();
  if (!publicKey) throw new Error("This passkey type isn't supported. Try another device.");
  const body: PasskeyRegistrationJSON = {
    id: toB64u(cred.rawId),
    clientDataJSON: toB64u(r.clientDataJSON),
    authenticatorData: toB64u(r.getAuthenticatorData()),
    publicKey: toB64u(publicKey),
    publicKeyAlgorithm: r.getPublicKeyAlgorithm(),
  };
  await api("/api/passkey/register", { json: body });
}

/** A passkey check for exactly this order (the server binds it to the amount and terms). */
export async function confirmWithPasskey(orderId: string): Promise<PasskeyAssertionJSON> {
  const { options: o } = await api<{ options: { challenge: string; rpId: string; allowCredentials: Desc[]; userVerification: UserVerificationRequirement; timeout: number } }>(
    `/api/orders/${orderId}/approve/options`,
    { method: "POST" },
  );
  let cred: PublicKeyCredential;
  try {
    cred = (await navigator.credentials.get({
      publicKey: { ...o, challenge: fromB64u(o.challenge), allowCredentials: o.allowCredentials.map((c) => ({ type: c.type, id: fromB64u(c.id) })) },
    })) as PublicKeyCredential;
  } catch (err) {
    throw explain(err);
  }
  const r = cred.response as AuthenticatorAssertionResponse;
  return { id: toB64u(cred.rawId), clientDataJSON: toB64u(r.clientDataJSON), authenticatorData: toB64u(r.authenticatorData), signature: toB64u(r.signature) };
}
