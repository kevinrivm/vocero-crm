import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { isAgentOnly } from "@/lib/auth/roles";
import { getIntegrationsData } from "@/server/tenant/integration-actions";
import { IntegrationsCenterClient } from "@/components/tenant/integrations-center-client";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (isAgentOnly(session.role, session.userRole)) redirect("/inbox");

  const data = await getIntegrationsData();

  return <IntegrationsCenterClient initialData={data} />;
}

