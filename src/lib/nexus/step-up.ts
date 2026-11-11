/**
 * Step-up check: big approvals need the customer's passkey (Face ID, Touch ID,
 * fingerprint or device PIN) on top of PayPal's own sign-in. Shared by the
 * server, which enforces it, and the approval screen, which explains it.
 */
export const STEP_UP_MIN_CENTS = 100_000; // $1,000

export const stepUpRequired = (order: { totalCents: number }) => order.totalCents >= STEP_UP_MIN_CENTS;

/** What the browser sends after a passkey set-up (navigator.credentials.create), base64url-encoded. */
export interface PasskeyRegistrationJSON {
  id: string;
  clientDataJSON: string;
  authenticatorData: string;
  /** SubjectPublicKeyInfo (DER) from AuthenticatorAttestationResponse.getPublicKey(). */
  publicKey: string;
  publicKeyAlgorithm: number;
}

/** What the browser sends after a passkey check (navigator.credentials.get), base64url-encoded. */
export interface PasskeyAssertionJSON {
  id: string;
  clientDataJSON: string;
  authenticatorData: string;
  signature: string;
}
