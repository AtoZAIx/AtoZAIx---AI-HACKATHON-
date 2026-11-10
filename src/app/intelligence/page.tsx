import { redirect } from "next/navigation";

/** Legacy URL from the first build. */
export default function LegacyIntelligence() {
  redirect("/analytics");
}
