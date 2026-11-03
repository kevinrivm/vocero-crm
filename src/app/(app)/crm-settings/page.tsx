import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { isAgentOnly } from "@/lib/auth/roles";
import { getCrmSettingsData } from "@/server/tenant/crm-actions";
import { CrmSettingsClient } from "@/components/tenant/crm-settings-client";

export const dynamic = "force-dynamic";

export default async function CrmSettingsPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (isAgentOnly(session.role, session.userRole)) redirect("/inbox");

  const crmData = await getCrmSettingsData();

  return <CrmSettingsClient initialData={crmData} />;
}

