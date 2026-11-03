import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { getWhatsAppMonitorData } from "@/server/superadmin/actions";
import { WhatsAppMonitorClient } from "@/components/superadmin/whatsapp-monitor-client";

export const dynamic = "force-dynamic";

export default async function SuperAdminWhatsAppPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (!session.isSuperAdmin) redirect("/inbox");

  const { instances, metrics } = await getWhatsAppMonitorData();

  return (
    <WhatsAppMonitorClient
      initialInstances={instances}
      initialMetrics={metrics}
    />
  );
}
