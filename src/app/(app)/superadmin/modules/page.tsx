import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { getAllOrganizations } from "@/server/superadmin/actions";
import { ModulesClient } from "@/components/superadmin/modules-client";

export const dynamic = "force-dynamic";

export default async function SuperAdminModulesPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (!session.isSuperAdmin) redirect("/inbox");

  const orgs = await getAllOrganizations();

  return <ModulesClient initialOrgs={orgs} />;
}

