import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { normalizeMx } from "@/lib/meta/client";
import { ingestInboundMessage } from "@/server/inbox/ingest";

export const dynamic = "force-dynamic";

/**
 * GET de comprobación / sondeo del webhook de Evolution API.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await params;
  return Response.json({
    status: "ok",
    service: "evolution-webhook-adapter",
    tenantId,
  });
}

/**
 * Webhook traductor para Evolution API.
 * Recibe eventos de WhatsApp (en particular `messages.upsert`),
 * traduce su estructura e ingesta el mensaje en Nexia.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await params;

  const db = getDb();
  const [org] = await db
    .select({
      id: schema.organization.id,
      name: schema.organization.name,
      evoApiKey: schema.organization.evoApiKey,
    })
    .from(schema.organization)
    .where(eq(schema.organization.id, tenantId))
    .limit(1);

  if (!org) {
    return Response.json({ error: "Tenant no encontrado" }, { status: 404 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
  }

  // Normalizar el tipo de evento (Evolution envía "messages.upsert" o "MESSAGES_UPSERT")
  const rawEvent = String(body.event || body.type || "").toLowerCase().replace(/_/g, ".");

  // Si no es un evento de mensajes nuevos, respondemos 200 para no generar reintentos
  if (rawEvent !== "messages.upsert") {
    return Response.json({
      status: "ignored",
      event: body.event ?? "unknown",
      message: "Solo se procesan eventos messages.upsert",
    });
  }

  // La data puede ser un objeto único o una lista de mensajes
  const rawData = body.data;
  const items: any[] = Array.isArray(rawData)
    ? rawData
    : rawData && typeof rawData === "object"
      ? [rawData]
      : [body];

  let processedCount = 0;

  for (const item of items) {
    if (!item || typeof item !== "object") continue;

    const key = item.key || item.message?.key || {};

    // Ignorar mensajes salientes enviados desde el propio dispositivo
    if (key.fromMe) {
      continue;
    }

    const remoteJid = String(key.remoteJid || item.sender || "");

    // Ignorar mensajes de grupos (@g.us) o listas de difusión (@broadcast)
    if (remoteJid.includes("@g.us") || remoteJid.includes("@broadcast")) {
      continue;
    }

    // Extraer número de teléfono del remitente
    const rawDigits = remoteJid.replace(/@.*$/, "").replace(/\D/g, "");
    if (!rawDigits) {
      continue;
    }

    const phone = normalizeMx(rawDigits);
    const pushName =
      (typeof item.pushName === "string" && item.pushName.trim()) ||
      (typeof item.verifiedBizName === "string" && item.verifiedBizName.trim()) ||
      null;

    // Extraer texto según el tipo de mensaje de WhatsApp
    const msg = item.message || {};
    let text: string | null =
      msg.conversation ||
      msg.extendedTextMessage?.text ||
      msg.imageMessage?.caption ||
      msg.videoMessage?.caption ||
      msg.documentMessage?.caption ||
      msg.buttonsResponseMessage?.selectedDisplayText ||
      msg.templateButtonReplyMessage?.selectedDisplayText ||
      msg.listResponseMessage?.title ||
      null;

    // Si el mensaje no trae texto explícito pero es multimedia, rotularlo
    if (!text) {
      if (msg.imageMessage) text = "[Imagen]";
      else if (msg.audioMessage) text = "[Nota de voz]";
      else if (msg.videoMessage) text = "[Video]";
      else if (msg.documentMessage)
        text = `[Documento: ${msg.documentMessage.fileName || "adjunto"}]`;
      else if (msg.stickerMessage) text = "[Sticker]";
      else if (msg.contactMessage || msg.contactsArrayMessage) text = "[Contacto]";
      else if (msg.locationMessage) text = "[Ubicación]";
      else text = "[Mensaje sin texto]";
    }

    const messageId = key.id
      ? `evo_${key.id}`
      : `evo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const timestamp = String(
      item.messageTimestamp || Math.floor(Date.now() / 1000)
    );

    const instanceName = String(body.instance || item.instance || "").trim();

    // Consultar el cortafuegos de IA en tenant_channels para esta instancia
    let channelEnableAi: boolean | undefined = undefined;
    if (instanceName) {
      try {
        const [tc] = await db
          .select({ enableAi: schema.tenantChannels.enableAi })
          .from(schema.tenantChannels)
          .where(
            and(
              scoped(schema.tenantChannels.organizationId, org.id),
              eq(schema.tenantChannels.platform, "evolution"),
              eq(schema.tenantChannels.providerId, instanceName)
            )
          )
          .limit(1);

        if (tc) {
          channelEnableAi = tc.enableAi;
        }
      } catch {
        // Continuar si la consulta falla
      }
    }

    try {
      await ingestInboundMessage({
        organizationId: org.id,
        identity: {
          identity: phone,
          channel: "whatsapp",
          phone: phone,
          waUserId: null,
          profileName: pushName,
        },
        waMessageId: messageId,
        type: "text",
        text,
        timestamp,
        providerId: instanceName || null,
        enableAi: channelEnableAi,
      });

      processedCount++;
    } catch (err) {
      console.error(
        `[evolution-webhook] Error al procesar mensaje de ${phone} para tenant ${org.id}:`,
        err
      );
    }
  }

  return Response.json({
    success: true,
    processed: processedCount,
  });
}

