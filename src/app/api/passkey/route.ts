import { cookies } from "next/headers";
import { handle } from "@/lib/nexus/http";
import { PASSKEY_COOKIE, unseal, type StoredPasskey } from "@/lib/nexus/security/passkey";

/** Whether this device has a passkey set up for approvals. The key itself stays in an HttpOnly cookie. */
export async function GET() {
  return handle(async () => {
    const pk = unseal<StoredPasskey>((await cookies()).get(PASSKEY_COOKIE)?.value);
    return { registered: Boolean(pk), createdAt: pk?.createdAt ?? null };
  });
}

/** Removes this device's passkey (the next big approval asks to set one up again). */
export async function DELETE() {
  return handle(async () => {
    (await cookies()).delete(PASSKEY_COOKIE);
    return { registered: false };
  });
}
