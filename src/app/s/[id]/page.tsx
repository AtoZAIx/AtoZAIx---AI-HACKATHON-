import { redirect } from "next/navigation";
import { Suspense } from "react";

/** Legacy URL from the first build. */
export default function LegacySession({ params }: PageProps<"/s/[id]">) {
  return (
    <Suspense fallback={null}>
      <Redirector params={params} />
    </Suspense>
  );
}

async function Redirector({ params }: Pick<PageProps<"/s/[id]">, "params">) {
  redirect(`/negotiations/${(await params).id}`);
  return null;
}
