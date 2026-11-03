import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { SuperAdminClient } from "@/components/superadmin/superadmin-client";
import {
  getAllOrganizations,
  getSuperAdminMetrics,
} from "@/server/superadmin/actions";

export const dynamic = "force-dynamic";

export default async function SuperAdminPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (!session.isSuperAdmin) redirect("/inbox");

  const [initialOrgs, initialMetrics] = await Promise.all([
    getAllOrganizations(),
    getSuperAdminMetrics(),
  ]);

  return (
    <SuperAdminClient
      currentOrgId={session.organizationId}
      initialOrgs={initialOrgs}
      initialMetrics={initialMetrics}
    />
  );
}

