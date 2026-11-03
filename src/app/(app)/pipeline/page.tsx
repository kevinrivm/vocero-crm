import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { isSuperAdmin } from "@/lib/auth/roles";
import { PipelineClient } from "@/components/pipeline/pipeline-client";
import { getEffectiveRolePermissions } from "@/server/tenant/permissions-actions";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");

  if (session.organizationId && session.organizationId !== "global") {
    const perms = await getEffectiveRolePermissions(session.organizationId, session.role);
    if (
      perms.pipeline === false &&
      !isSuperAdmin(session.role, session.userRole) &&
      session.role !== "owner"
    ) {
      redirect("/inbox");
    }
  }

  return <PipelineClient />;
}
