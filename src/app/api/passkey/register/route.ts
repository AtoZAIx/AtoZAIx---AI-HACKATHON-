import { cookies } from "next/headers";
import { z } from "zod";
import { body, handle } from "@/lib/nexus/http";
import { CHALLENGE_COOKIE, cookieOptions, PASSKEY_COOKIE, publicOrigin, seal, verifyRegistration } from "@/lib/nexus/security/passkey";

const b64u = z.string().regex(/^[A-Za-z0-9_-]+$/).max(8192);
const Body = z.object({ id: b64u, clientDataJSON: b64u, authenticatorData: b64u, publicKey: b64u, publicKeyAlgorithm: z.number().int() });

/** Finishes a passkey set-up: verified on the server, then only the public key is kept (signed cookie). */
export async function POST(req: Request) {
  return handle(async () => {
    const origin = publicOrigin(req);
    const response = await body(req, Body);
    const jar = await cookies();
    const passkey = verifyRegistration({ challengeToken: jar.get(CHALLENGE_COOKIE)?.value, response, origin });
    jar.delete(CHALLENGE_COOKIE);
    jar.set(PASSKEY_COOKIE, seal(passkey), cookieOptions(origin, 60 * 60 * 24 * 365));
    return { registered: true, createdAt: passkey.createdAt };
  });
}
