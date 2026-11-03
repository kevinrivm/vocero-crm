import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { getSuperAdminAnalyticsData } from "@/server/superadmin/actions";
import { AnalyticsClient } from "@/components/superadmin/analytics-client";

export const dynamic = "force-dynamic";

export default async function SuperAdminAnalyticsPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (!session.isSuperAdmin) redirect("/inbox");

  const data = await getSuperAdminAnalyticsData();

  return <AnalyticsClient data={data} />;
}
