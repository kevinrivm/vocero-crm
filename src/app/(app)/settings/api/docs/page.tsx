import { notFound, redirect } from "next/navigation";
import { canConfigure } from "@/lib/auth/roles";
import { getSessionOrNull } from "@/lib/auth/session";
import { ApiDocs } from "@/components/settings/api-docs";
import { contratoPara, origenPublico } from "@/server/api-v1/docs";
import { apiV1Enabled } from "@/server/api-v1/flag";

export const dynamic = "force-dynamic";

/** Ajustes → API → Documentación. Solo con `API_V1=on` y para quien configura. */
export default async function ApiDocsPage() {
  if (!apiV1Enabled()) notFound();
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (!canConfigure(session.role)) notFound();
  const origen = origenPublico();
  return <ApiDocs spec={contratoPara(origen)} base={`${origen}/api/v1`} />;
}
