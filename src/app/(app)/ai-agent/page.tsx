import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getSessionOrNull } from "@/lib/auth/session";
import { canConfigure } from "@/lib/auth/roles";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { guideStatus } from "@/server/onboarding/guide";
import {
  AiAgentClient,
  type StepItem,
} from "@/components/tenant/ai-agent-client";

export const dynamic = "force-dynamic";

/**
 * Sección permanente de gestión y salud del Agente IA y Canales.
 * Sustituye la antigua pantalla bloqueante de Onboarding para los administradores.
 */
export default async function AiAgentPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (!canConfigure(session.role)) redirect("/inbox");

  const db = getDb();

  const [guide, [profile], [org], [channel]] = await Promise.all([
    guideStatus(session.organizationId),
    db
      .select({
        name: schema.agentProfile.name,
        enabled: schema.agentProfile.enabled,
      })
      .from(schema.agentProfile)
      .where(scoped(schema.agentProfile.organizationId, session.organizationId))
      .limit(1),
    db
      .select({
        dispatchWebhookUrl: schema.organization.dispatchWebhookUrl,
        botApiKey: schema.organization.botApiKey,
        evoInstance: schema.organization.evoInstance,
        evoApiKey: schema.organization.evoApiKey,
      })
      .from(schema.organization)
      .where(eq(schema.organization.id, session.organizationId))
      .limit(1),
    db
      .select({
        status: schema.metaCredentials.status,
      })
      .from(schema.metaCredentials)
      .where(scoped(schema.metaCredentials.organizationId, session.organizationId))
      .limit(1),
  ]);

  const rawAgentStep = guide.steps.find((s) => s.key === "agent");
  const rawAiStep = guide.steps.find((s) => s.key === "ai");
  const rawWaStep = guide.steps.find((s) => s.key === "whatsapp");
  const rawBrainStep = guide.steps.find((s) => s.key === "brain");

  const evoConnected = Boolean(org?.evoInstance && org?.evoApiKey);
  const waConnected = Boolean(channel?.status === "connected" || rawWaStep?.done);
  const channelsReady = waConnected || evoConnected;

  const dispatchConfigured = Boolean(org?.dispatchWebhookUrl);
  const brainReady = Boolean(rawBrainStep?.done || dispatchConfigured);

  const steps: StepItem[] = [
    {
      id: "agent",
      number: 1,
      title: "Configura tu agente",
      description:
        "Ponle nombre, instrucciones, tono y cuéntale a qué se dedica tu negocio con la base de conocimiento.",
      href: "/agent",
      ctaText: "Ir a Agente",
      isDone: Boolean(rawAgentStep?.done),
      hint: rawAgentStep?.hint ?? null,
    },
    {
      id: "ai",
      number: 2,
      title: "Vincula tu proveedor de IA",
      description:
        "Es la cuenta con la que tu agente piensa: OpenRouter, OpenAI o proveedores LLM compatibles.",
      href: "/settings/ai",
      ctaText: "Vincular Proveedor",
      isDone: Boolean(rawAiStep?.done),
      hint: rawAiStep?.hint ?? null,
    },
    {
      id: "whatsapp",
      number: 3,
      title: "Vincula tus Canales de Mensajería",
      description:
        "Conecta tu número oficial de WhatsApp Cloud API, Evolution API o redes sociales para recibir y enviar mensajes.",
      href: "/integrations",
      ctaText: "Ir a Canales & API",
      isDone: channelsReady,
      hint:
        channelsReady
          ? null
          : (rawWaStep?.hint ?? "Conecta WhatsApp Cloud API o Evolution API en Canales & API"),
    },
    {
      id: "brain",
      number: 4,
      title: "Conecta tu agente y despacho",
      description:
        "Configura el webhook de despacho hacia n8n, tu agente externo o servidor Nea para automatizar la atención.",
      href: "/integrations",
      ctaText: "Configurar Despacho",
      isDone: brainReady,
      hint:
        brainReady
          ? null
          : "Agrega tu Webhook de Despacho en Canales & API > API & Webhooks",
    },
  ];

  const canEnable = brainReady || guide.brainConnected;
  const cannotEnableReason = canEnable
    ? null
    : "Requiere configurar el Webhook de Despacho o conectar un cerebro externo antes de encender el agente.";

  return (
    <AiAgentClient
      steps={steps}
      agentName={profile?.name?.trim() || null}
      isEnabled={profile?.enabled ?? false}
      canEnable={canEnable}
      cannotEnableReason={cannotEnableReason}
    />
  );
}

