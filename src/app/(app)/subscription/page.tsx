import { redirect } from "next/navigation";
import { and, count, eq, ne } from "drizzle-orm";
import { getSessionOrNull } from "@/lib/auth/session";
import { isAgentOnly } from "@/lib/auth/roles";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import {
  SubscriptionClient,
  type SubscriptionData,
} from "@/components/tenant/subscription-client";

export const dynamic = "force-dynamic";

export default async function SubscriptionPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (isAgentOnly(session.role, session.userRole)) redirect("/inbox");

  const db = getDb();

  // 1. Consultar organización actual usando el tenantId estricto de la sesión
  const [org] = await db
    .select({
      id: schema.organization.id,
      name: schema.organization.name,
      plan: schema.organization.plan,
      status: schema.organization.status,
      maxAgents: schema.organization.maxAgents,
      whatsappStatus: schema.organization.whatsappStatus,
      planExpiresAt: schema.organization.planExpiresAt,
      moduleInternalChat: schema.organization.moduleInternalChat,
      moduleAutomations: schema.organization.moduleAutomations,
      moduleApi: schema.organization.moduleApi,
      moduleMassiveBroadcast: schema.organization.moduleMassiveBroadcast,
    })
    .from(schema.organization)
    .where(eq(schema.organization.id, session.organizationId))
    .limit(1);

  if (!org) redirect("/login");

  // 2. Consultar conteo de miembros/agentes vinculados a la compañía (excluyendo Súper Admin)
  const [membersCountRes] = await db
    .select({ count: count() })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
    .where(
      and(
        scoped(schema.member.organizationId, session.organizationId),
        ne(schema.user.role, "superadmin"),
        ne(schema.user.role, "super admin")
      )
    );

  const agentsCount = membersCountRes?.count ?? 1;
  const maxAgents = org.maxAgents ?? 3;
  const usagePercentage = Math.min(100, Math.round((agentsCount / maxAgents) * 100));

  // 3. Formateo de fecha de corte y días restantes
  let formattedExpiresAt = "Sin fecha de corte";
  let daysRemaining: number | null = null;

  if (org.planExpiresAt) {
    const expiresDate = new Date(org.planExpiresAt);
    formattedExpiresAt = expiresDate.toLocaleDateString("es-ES", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const diffMs = expiresDate.getTime() - Date.now();
    daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  }

  const subscriptionData: SubscriptionData = {
    organizationId: org.id,
    organizationName: org.name,
    plan: org.plan || "trial",
    status: org.status || "active",
    maxAgents,
    agentsCount,
    usagePercentage,
    planExpiresAt: org.planExpiresAt ? org.planExpiresAt.toISOString() : null,
    formattedExpiresAt,
    daysRemaining,
    whatsappStatus: org.whatsappStatus || "unlinked",
    modules: {
      moduleInternalChat: org.moduleInternalChat ?? true,
      moduleAutomations: org.moduleAutomations ?? false,
      moduleApi: org.moduleApi ?? false,
      moduleMassiveBroadcast: org.moduleMassiveBroadcast ?? false,
    },
  };

  return <SubscriptionClient data={subscriptionData} />;
}
