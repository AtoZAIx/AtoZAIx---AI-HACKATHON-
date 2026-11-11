import { cookies } from "next/headers";
import { handle } from "@/lib/nexus/http";
import { CHALLENGE_COOKIE, cookieOptions, newChallenge, PASSKEY_COOKIE, publicOrigin, registrationOptions, unseal, type StoredPasskey } from "@/lib/nexus/security/passkey";

/** Starts a passkey set-up: a one-time challenge, kept signed in a short-lived cookie. */
export async function POST(req: Request) {
  return handle(async () => {
    const origin = publicOrigin(req);
    const jar = await cookies();
    const { challenge, token } = newChallenge("register");
    jar.set(CHALLENGE_COOKIE, token, cookieOptions(origin, 300));
    return { options: registrationOptions(origin, challenge, unseal<StoredPasskey>(jar.get(PASSKEY_COOKIE)?.value)) };
  });
}
