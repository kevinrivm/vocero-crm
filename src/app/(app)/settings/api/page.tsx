import { notFound, redirect } from "next/navigation";
import { canConfigure } from "@/lib/auth/roles";
import { getSessionOrNull } from "@/lib/auth/session";
import { ApiKeysClient } from "@/components/settings/llaves-api-client";
import { apiV1Enabled } from "@/server/api-v1/flag";
import { origenPublico } from "@/server/api-v1/docs";

export const dynamic = "force-dynamic";

/** Ajustes → API. Solo existe con `API_V1=on` y solo para quien configura. */
export default async function ApiSettingsPage() {
  if (!apiV1Enabled()) notFound();
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (!canConfigure(session.role)) notFound();
  return <ApiKeysClient origen={origenPublico()} />;
}
