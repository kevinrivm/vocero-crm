import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { getSuperAdminBillingData } from "@/server/superadmin/actions";
import { BillingClient } from "@/components/superadmin/billing-client";

export const dynamic = "force-dynamic";

export default async function SuperAdminBillingPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (!session.isSuperAdmin) redirect("/inbox");

  const data = await getSuperAdminBillingData();

  return <BillingClient data={data} />;
}
