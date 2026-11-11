import { createHash, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { newChallenge, seal, unseal, verifyApproval, verifyRegistration, type StoredPasskey } from "@/lib/nexus/security/passkey";
import { approveOrder, createSession, lockDealAndPrepareOrder, streamNegotiation } from "@/lib/nexus/service";
import { STEP_UP_MIN_CENTS, stepUpRequired } from "@/lib/nexus/step-up";
import { store } from "@/lib/nexus/store";

const ORIGIN = "https://nexus.example.com";
const b64u = (b: Buffer) => b.toString("base64url");
const sha = (x: Buffer | string) => createHash("sha256").update(x).digest();

/** A software authenticator: what a phone's Face ID or a laptop's Touch ID does, with a real key. */
function authenticator(kind: "ec" | "rsa" = "ec") {
  const { publicKey, privateKey } = kind === "ec" ? generateKeyPairSync("ec", { namedCurve: "P-256" }) : generateKeyPairSync("rsa", { modulusLength: 2048 });
  const id = b64u(Buffer.from("credential-id-0123456789"));
  let counter = 0;
  const authData = (flags: number, n: number, rp = "nexus.example.com") => {
    const c = Buffer.alloc(4);
    c.writeUInt32BE(n);
    return Buffer.concat([sha(rp), Buffer.from([flags]), c]);
  };
  const client = (type: string, challenge: string, origin = ORIGIN) => Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
  return {
    register(challenge: string, o: { origin?: string; flags?: number } = {}) {
      return {
        id,
        clientDataJSON: b64u(client("webauthn.create", challenge, o.origin)),
        authenticatorData: b64u(authData(o.flags ?? 0x45, 0)),
        publicKey: b64u((publicKey as KeyObject).export({ format: "der", type: "spki" }) as Buffer),
        publicKeyAlgorithm: kind === "ec" ? -7 : -257,
      };
    },
    approve(challenge: string, o: { origin?: string; flags?: number; counter?: number; rp?: string; key?: KeyObject } = {}) {
      counter = o.counter ?? counter + 1;
      const cd = client("webauthn.get", challenge, o.origin);
      const ad = authData(o.flags ?? 0x05, counter, o.rp);
      const signature = sign("sha256", Buffer.concat([ad, sha(cd)]), o.key ?? privateKey);
      return { id, clientDataJSON: b64u(cd), authenticatorData: b64u(ad), signature: b64u(signature) };
    },
  };
}

function setUp(a = authenticator()): StoredPasskey {
  const { challenge, token } = newChallenge("register");
  return verifyRegistration({ challengeToken: token, response: a.register(challenge), origin: ORIGIN });
}

const ORDER = { orderId: "ord_1", amountCents: 400_700, termsHash: "a".repeat(64) };

describe("passkey set-up", () => {
  it("keeps only the public key, and only after checking challenge, origin and user verification", () => {
    const a = authenticator();
    const pk = setUp(a);
    expect(pk).toMatchObject({ v: 1, alg: -7, counter: 0 });
    expect(JSON.stringify(pk)).not.toMatch(/PRIVATE/);

    const wrongSite = newChallenge("register");
    expect(() => verifyRegistration({ challengeToken: wrongSite.token, response: a.register(wrongSite.challenge, { origin: "https://evil.example" }), origin: ORIGIN })).toThrow(/another site/);
    const noUv = newChallenge("register");
    expect(() => verifyRegistration({ challengeToken: noUv.token, response: a.register(noUv.challenge, { flags: 0x41 }), origin: ORIGIN })).toThrow(/verify you/);
    const other = newChallenge("register");
    expect(() => verifyRegistration({ challengeToken: newChallenge("register").token, response: a.register(other.challenge), origin: ORIGIN })).toThrow(/doesn't match/);
  });

  it("works with RSA passkeys too (Windows Hello)", () => {
    const a = authenticator("rsa");
    const pk = setUp(a);
    const { challenge, token } = newChallenge("approve", ORDER);
    expect(verifyApproval({ challengeToken: token, passkey: pk, response: a.approve(challenge), origin: ORIGIN, expect: ORDER }).counter).toBe(1);
  });

  it("seals what the browser carries, so it can't be swapped or edited", () => {
    const pk = setUp();
    const sealed = seal(pk);
    expect(unseal(sealed)).toEqual(pk);
    const [body, mac] = sealed.split(".");
    const edited = b64u(Buffer.from(JSON.stringify({ ...pk, publicKey: "AAAA" })));
    expect(unseal(`${edited}.${mac}`)).toBeNull();
    expect(unseal(`${body}.${"0".repeat(mac.length)}`)).toBeNull();
  });
});

describe("passkey approval", () => {
  it("verifies a real signature for exactly this order, amount and terms", () => {
    const a = authenticator();
    const pk = setUp(a);
    const { challenge, token } = newChallenge("approve", ORDER);
    expect(verifyApproval({ challengeToken: token, passkey: pk, response: a.approve(challenge), origin: ORIGIN, expect: ORDER })).toEqual({ counter: 1 });
  });

  it("refuses a check made for a different amount, order or terms", () => {
    const a = authenticator();
    const pk = setUp(a);
    for (const expect_ of [{ ...ORDER, amountCents: 999_999 }, { ...ORDER, orderId: "ord_2" }, { ...ORDER, termsHash: "b".repeat(64) }]) {
      const { challenge, token } = newChallenge("approve", ORDER);
      expect(() => verifyApproval({ challengeToken: token, passkey: pk, response: a.approve(challenge), origin: ORIGIN, expect: expect_ })).toThrow(/different amount or order/);
    }
  });

  it("refuses a forged signature, another device's key, another site and a missing fingerprint/PIN check", () => {
    const a = authenticator();
    const pk = setUp(a);
    const attacker = generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey;
    const cases: Array<[Parameters<typeof a.approve>[1], RegExp]> = [
      [{ key: attacker }, /signature didn't verify/],
      [{ origin: "https://evil.example" }, /another site/],
      [{ rp: "evil.example" }, /another site/],
      [{ flags: 0x01 }, /verify you/],
    ];
    for (const [o, err] of cases) {
      const { challenge, token } = newChallenge("approve", ORDER);
      expect(() => verifyApproval({ challengeToken: token, passkey: pk, response: a.approve(challenge, o), origin: ORIGIN, expect: ORDER })).toThrow(err);
    }
  });

  it("works once per check: a captured response can't be replayed", () => {
    const a = authenticator();
    const pk = setUp(a);
    const { challenge, token } = newChallenge("approve", ORDER);
    const response = a.approve(challenge);
    const first = verifyApproval({ challengeToken: token, passkey: pk, response, origin: ORIGIN, expect: ORDER });
    expect(() => verifyApproval({ challengeToken: token, passkey: { ...pk, counter: 0 }, response, origin: ORIGIN, expect: ORDER })).toThrow(/already used/);
    // And a counter that doesn't go up (a cloned key) is refused.
    const next = newChallenge("approve", ORDER);
    expect(() => verifyApproval({ challengeToken: next.token, passkey: { ...pk, counter: first.counter }, response: a.approve(next.challenge, { counter: first.counter }), origin: ORIGIN, expect: ORDER })).toThrow(
      /counter went backwards/,
    );
  });

  it("expires after five minutes, and needs a passkey set up first", () => {
    const a = authenticator();
    const pk = setUp(a);
    const { challenge, token } = newChallenge("approve", ORDER, Date.now() - 6 * 60_000);
    expect(() => verifyApproval({ challengeToken: token, passkey: pk, response: a.approve(challenge), origin: ORIGIN, expect: ORDER })).toThrow(/expired/);
    const fresh = newChallenge("approve", ORDER);
    expect(() => verifyApproval({ challengeToken: fresh.token, passkey: null, response: a.approve(fresh.challenge), origin: ORIGIN, expect: ORDER })).toThrow(/Set up a passkey/);
  });
});

describe("the server refuses big approvals without a passkey", () => {
  beforeEach(async () => {
    await store.reset();
  });

  it("asks for the passkey from $1,000, and approves once it was checked", async () => {
    expect(STEP_UP_MIN_CENTS).toBe(100_000);
    expect(stepUpRequired({ totalCents: 99_999 })).toBe(false);
    expect(stepUpRequired({ totalCents: 100_000 })).toBe(true);

    const { session } = await createSession("buy a house in Austin under $450,000 with 3 bedrooms");
    for await (const e of streamNegotiation(session.id)) void e;
    const done = (await store.getSession(session.id))!;
    const { order } = await lockDealAndPrepareOrder(session.id, done.result!.recommendedOfferId!);
    expect(order.totalCents).toBeGreaterThanOrEqual(STEP_UP_MIN_CENTS); // the $4,007 house token
    const terms = { termsHash: order.termsHash, amountCents: order.totalCents, agreementVersion: order.agreementVersion };
    await expect(approveOrder(order.id, terms)).rejects.toThrow(/need your passkey/);
    const approved = await approveOrder(order.id, terms, { stepUp: "passkey" });
    expect(approved.status).toBe("approved");
    expect(approved.timeline.at(-1)?.detail).toContain("confirmed with passkey");
  });
});
