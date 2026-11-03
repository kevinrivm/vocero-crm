import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { getSessionOrNull } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { aparienciaActual } from "@/server/apariencia";
import { getBranding } from "@/server/branding";
import { AppShell } from "@/components/app-shell";
import { CuentaSuspendida } from "@/components/cuenta-suspendida";
import { resolveCommit } from "@/lib/version";
import { agendaEnabled } from "@/server/agenda/flag";
import { enabledChannels } from "@/server/channels/enabled";
import { navKicker } from "@/lib/channels";
import { avisoIaDe } from "@/server/ai/aviso";
import { AvisoIaBanner } from "@/components/avisos/aviso-ia";
import { getActiveAnnouncement } from "@/server/superadmin/actions";
import { getLinkedChannelsForOrg } from "@/server/channels/linked";
import { getEffectiveRolePermissions } from "@/server/tenant/permissions-actions";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");

  const db = getDb();

  // 1. Safe Check de Organización
  let org = null;
  if (session.organizationId && session.organizationId !== "global") {
    const [found] = await db
      .select({
        id: schema.organization.id,
        name: schema.organization.name,
        isActive: schema.organization.isActive,
        status: schema.organization.status,
        moduleInternalChat: schema.organization.moduleInternalChat,
        moduleAutomations: schema.organization.moduleAutomations,
        moduleApi: schema.organization.moduleApi,
        moduleMassiveBroadcast: schema.organization.moduleMassiveBroadcast,
      })
      .from(schema.organization)
      .where(eq(schema.organization.id, session.organizationId))
      .limit(1);
    org = found ?? null;
  }

  // 2. Si no es Super Admin y no tiene organización válida, redirigir a onboarding
  if (!session.isSuperAdmin && !org) {
    redirect("/onboarding");
  }

  // 3. Verificación de empresa suspendida (solo afecta a usuarios normales)
  const isSuspended = org ? !org.isActive || org.status === "suspended" : false;
  if (isSuspended && !session.isSuperAdmin) {
    return <CuentaSuspendida orgName={org?.name ?? "Tu empresa"} isSuperAdmin={false} />;
  }

  // 4. Carga segura de branding y preferencias (protegida para superadmin global sin orgs)
  const effectiveOrgId = org?.id ?? (session.isSuperAdmin ? null : session.organizationId);
  const branding = await getBranding(effectiveOrgId ?? undefined);
  const authSession = await getAuth().api.getSession({
    headers: await headers(),
  });

  const { apariencia } = await aparienciaActual(effectiveOrgId ?? undefined);
  const aviso = effectiveOrgId ? await avisoIaDe(effectiveOrgId) : null;
  const globalAnnouncement = await getActiveAnnouncement();
  const linkedChannels = effectiveOrgId
    ? await getLinkedChannelsForOrg(effectiveOrgId)
    : ["whatsapp"];
  const rolePermissions = effectiveOrgId
    ? await getEffectiveRolePermissions(effectiveOrgId, session.role)
    : null;

  return (
    <AppShell
      branding={branding}
      userId={session.userId}
      userName={authSession?.user.name ?? (session.isSuperAdmin ? "Súper Admin" : "Usuario")}
      role={session.role}
      isSuperAdmin={session.isSuperAdmin}
      apariencia={apariencia}
      commit={resolveCommit()}
      agenda={agendaEnabled()}
      permissions={rolePermissions}
      kicker={navKicker([...enabledChannels()])}
      aviso={aviso ? <AvisoIaBanner aviso={aviso} /> : null}
      globalAnnouncement={globalAnnouncement}
      linkedChannels={linkedChannels}
      modules={{
        moduleInternalChat: org?.moduleInternalChat ?? true,
        moduleAutomations: org?.moduleAutomations ?? false,
        moduleApi: org?.moduleApi ?? false,
        moduleMassiveBroadcast: org?.moduleMassiveBroadcast ?? false,
      }}
    >
      {children}
    </AppShell>
  );
}
