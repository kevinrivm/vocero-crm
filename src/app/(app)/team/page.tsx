import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { isAgentOnly } from "@/lib/auth/roles";
import { getTeamData } from "@/server/tenant/team-actions";
import { getTenantPermissionsData } from "@/server/tenant/permissions-actions";
import { TeamManagementClient } from "@/components/tenant/team-management-client";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (isAgentOnly(session.role, session.userRole)) redirect("/inbox");

  const [teamData, permissionsData] = await Promise.all([
    getTeamData(),
    getTenantPermissionsData(),
  ]);

  return (
    <TeamManagementClient
      initialData={teamData}
      initialPermissions={permissionsData}
    />
  );
}

