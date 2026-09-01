import { createHmac, timingSafeEqual } from "node:crypto";
import { IG_PREFIX } from "@/server/inbox/identity";
import { ingestInboundMessage } from "@/server/inbox/ingest";
import {
  getInstagramCredentialsByAccountRef,
  getInstagramCredentialsByIgUserId,
} from "@/server/instagram/credentials";
import { createLogger } from "@/lib/logger";

const log = createLogger("ig");

/**
 * 014 — Adaptadores de entrada del canal de Instagram.
 *
 * Dos fuentes con formatos que no se parecen en nada: Zernio manda un evento
 * plano y Meta manda `entry[].messaging[]` al estilo Messenger. Cada una se
 * normaliza aquí y de ahí en adelante corre el MISMO núcleo de ingesta que ya
 * resuelve contacto, conversación, idempotencia y bus de eventos.
 */

/** Firma de Zernio: HMAC-SHA256 hex del cuerpo CRUDO, con el secreto. */
export function isValidZernioSignature(
  rawBody: string,
  signature: string | null,
  secret: string | null
): boolean {
  if (!secret) return true; // sin secreto configurado, protege la URL secreta
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature.trim().toLowerCase(), "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

type ZernioEvent = {
  id?: string;
  event?: string;
  message?: {
    id?: string;
    conversationId?: string;
    direction?: string;
    text?: string | null;
    sender?: { id?: string; name?: string | null; username?: string | null };
  };
  account?: { id?: string; platform?: string };
};

/**
 * Evento de Zernio. Devuelve el secreto esperado para poder validar la firma
 * ANTES de procesar: el enrutado por `account.id` necesita leer el cuerpo, así
 * que la validación ocurre en dos tiempos (resolver cuenta, luego firmar).
 */
export async function resolveZernioSecret(
  rawBody: string
): Promise<{ secret: string | null; accountRef: string | null }> {
  let parsed: ZernioEvent | null = null;
  try {
    parsed = JSON.parse(rawBody) as ZernioEvent;
  } catch {
    return { secret: null, accountRef: null };
  }
  const accountRef = parsed.account?.id ?? null;
  if (!accountRef) return { secret: null, accountRef: null };
  const creds = await getInstagramCredentialsByAccountRef(accountRef);
  return { secret: creds?.webhookSecret ?? null, accountRef };
}

export async function processZernioEvent(payload: unknown): Promise<void> {
  const evt = payload as ZernioEvent;

  // El mismo webhook trae WhatsApp, Facebook y X si esas cuentas estan
  // conectadas: sin este filtro acabariamos ingiriendo otra plataforma como
  // si fueran DMs de Instagram.
  if (evt.account?.platform !== "instagram") return;
  if (evt.event !== "message.received") return;
  if (evt.message?.direction && evt.message.direction !== "incoming") return;

  const accountRef = evt.account?.id;
  if (!accountRef) return;

  const creds = await getInstagramCredentialsByAccountRef(accountRef);
  if (!creds) {
    log.warn(
      "evento para accountId desconocido — guarda la conexion en Configuracion -> Instagram para recibir mensajes",
      { accountRef }
    );
    return;
  }
  if (creds.source !== "zernio") {
    // Defensa en profundidad: esta instancia no habla con Zernio, asi que un
    // payload con su forma no puede ser legitimo aunque llegue por la URL
    // correcta. Sin esto, la unica barrera de la forma ajena es la URL.
    log.warn("payload de Zernio en instancia con otra fuente: descartado", {
      source: creds.source,
    });
    return;
  }

  const igsid = evt.message?.sender?.id;
  if (!igsid) {
    log.warn("evento sin sender.id: descartado", { eventId: evt.id ?? null });
    return;
  }

  const text = evt.message?.text ?? null;
  const platformMessageId = evt.message?.id;
  if (!platformMessageId) {
    log.warn("evento sin id de mensaje: descartado", { eventId: evt.id ?? null });
    return;
  }

  await ingestInboundMessage({
    organizationId: creds.organizationId,
    identity: {
      identity: `${IG_PREFIX}${igsid}`,
      channel: "instagram",
      phone: null,
      waUserId: null,
      profileName:
        evt.message?.sender?.name ??
        (evt.message?.sender?.username
          ? `@${evt.message.sender.username}`
          : null),
    },
    // Prefijado para que no colisione jamas con un id de WhatsApp en el
    // indice unico de mensajes.
    waMessageId: `ig_${platformMessageId}`,
    type: "text",
    text,
    timestamp: String(Math.floor(Date.now() / 1000)),
    threadRef: evt.message?.conversationId ?? null,
  });
}

type MetaIgPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    time?: number;
    messaging?: Array<{
      sender?: { id?: string };
      recipient?: { id?: string };
      timestamp?: number;
      message?: {
        mid?: string;
        text?: string;
        is_echo?: boolean;
      };
    }>;
  }>;
};

export async function processMetaInstagramPayload(
  payload: unknown
): Promise<void> {
  const body = payload as MetaIgPayload;
  if (body.object !== "instagram") return;

  for (const entry of body.entry ?? []) {
    const igUserId = entry.id;
    if (!igUserId) continue;

    const creds = await getInstagramCredentialsByIgUserId(igUserId);
    if (!creds) {
      log.warn(
        "evento para IG_ID desconocido — guarda la conexion en Configuracion -> Instagram para recibir mensajes",
        { igUserId }
      );
      continue;
    }
    if (creds.source !== "meta") {
      // Idem: sin app propia de Meta, un payload con su forma no puede venir
      // de Meta. Cierra la inyeccion en instancias que solo usan Zernio, donde
      // META_APP_SECRET no existe y la firma no se puede verificar.
      log.warn("payload de Meta en instancia con otra fuente: descartado", {
        source: creds.source,
      });
      continue;
    }

    for (const m of entry.messaging ?? []) {
      // Los echos son mensajes que el dueno mando desde la app de Instagram.
      // Fuera del alcance del 014: se ignoran sin ruido.
      if (m.message?.is_echo) continue;

      const igsid = m.sender?.id;
      const mid = m.message?.mid;
      if (!igsid || !mid) continue;
      if (typeof m.message?.text !== "string") continue; // solo texto (014)

      await ingestInboundMessage({
        organizationId: creds.organizationId,
        identity: {
          identity: `${IG_PREFIX}${igsid}`,
          channel: "instagram",
          phone: null,
          waUserId: null,
          // Meta no manda nombre ni usuario en el webhook: queda el respaldo
          // hasta que alguien edite el contacto.
          profileName: null,
        },
        waMessageId: `ig_${mid}`,
        type: "text",
        text: m.message.text,
        timestamp: String(
          m.timestamp ? Math.floor(m.timestamp / 1000) : Math.floor(Date.now() / 1000)
        ),
        threadRef: null,
      });
    }
  }
}
