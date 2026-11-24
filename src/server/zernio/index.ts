import { createHmac, timingSafeEqual } from "node:crypto";
import { MetaApiError } from "@/lib/meta/client";

/**
 * 017 — Transporte de Zernio, compartido por los canales que lo usan.
 *
 * Zernio es una API unificada: UNA cuenta y UNA llave entregan los mensajes de
 * todas las plataformas conectadas (Instagram, Facebook/Messenger, X…) por el
 * mismo webhook, y se responde por el mismo endpoint de conversaciones. Lo que
 * distingue el canal es `account.platform`, y lo que enruta a la organización
 * es `account.id`.
 *
 * Esto vive aparte de cada canal a propósito: la verificación de la firma es
 * un control de seguridad, y dos implementaciones del mismo control son dos
 * sitios donde equivocarse. El canal decide QUÉ plataforma acepta; este módulo
 * resuelve CÓMO se habla con Zernio.
 */

export const ZERNIO_BASE = process.env.ZERNIO_BASE_URL ?? "https://zernio.com/api/v1";

/** Cabeceras con las que Zernio firma sus entregas (la segunda es heredada). */
const SIGNATURE_HEADERS = ["x-zernio-signature", "x-late-signature"] as const;

export function zernioSignatureFrom(headers: Headers): string | null {
  for (const h of SIGNATURE_HEADERS) {
    const value = headers.get(h);
    if (value) return value;
  }
  return null;
}

/**
 * Firma de Zernio: HMAC-SHA256 en hex del cuerpo CRUDO, con el secreto de esa
 * cuenta. Sin secreto configurado la capa queda desactivada y protege solo el
 * segmento secreto de la URL — mismo trato que da el webhook de WhatsApp a
 * `META_APP_SECRET`.
 */
export function isValidZernioSignature(
  rawBody: string,
  signature: string | null,
  secret: string | null
): boolean {
  if (!secret) return true;
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature.trim().toLowerCase(), "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * 023 — Firma válida contra CUALQUIERA de los secretos. Un webhook de Zernio
 * firma con un solo secreto y sirve a todos los canales de esa llave; el CRM
 * guarda uno por canal, y si al capturarlos no quedaron iguales, un canal
 * rechazaba todo con 401. Sin secretos la capa queda desactivada, igual que
 * `isValidZernioSignature`.
 */
export function isValidZernioSignatureAny(
  rawBody: string,
  signature: string | null,
  secrets: readonly string[]
): boolean {
  if (secrets.length === 0) return true;
  return secrets.some((s) => isValidZernioSignature(rawBody, signature, s));
}

/** El evento de Zernio, en lo que a Vocero le importa. */
export type ZernioEvent = {
  id?: string;
  event?: string;
  message?: {
    /**
     * Id de Zernio, NO el de la plataforma (ese viene en
     * `platformMessageId`). Es el que dedupe: se mantiene entre reentregas
     * del mismo mensaje, que es justo lo que hay que colapsar.
     */
    id?: string;
    platformMessageId?: string;
    /**
     * Identificador OPACO del hilo. La propia API dice «format not to be
     * assumed»: su endpoint de respuesta lo acepta verbatim, ya venga del
     * listado o de aquí. No se parsea ni se compara con el de la plataforma.
     */
    conversationId?: string;
    /** 022: la plataforma también viene en el mensaje, no solo en la cuenta. */
    platform?: string;
    direction?: string;
    text?: string | null;
    /** Cuándo lo mandó la persona, ISO-8601. Ver `zernioSentAtSeconds`. */
    sentAt?: string;
    attachments?: { type?: string; url?: string }[];
    sender?: { id?: string; name?: string | null; username?: string | null };
  };
  /** 022: el hilo también viene aparte; su `id` es el `conversationId`. */
  conversation?: { id?: string };
  /**
   * 072 — Evento `reaction.received`: el cliente puso o quitó una reacción.
   * `messageId` (id de Zernio) puede faltar; `platformMessageId` siempre viene.
   * Al quitar, `action` = `removed` y `emoji` = "".
   */
  reaction?: {
    emoji?: string;
    action?: string;
    messageId?: string;
    platformMessageId?: string;
    sender?: { id?: string; name?: string | null };
    reactedAt?: string;
  };
  /**
   * 023: `profileId` es el del perfil que agrupa las cuentas. Sirve para
   * corregir una conexión guardada con ese id en vez del de la cuenta.
   */
  account?: { id?: string; accountId?: string; platform?: string; profileId?: string };
};

/**
 * Hora del mensaje en segundos, la que trae el evento y no la de llegada.
 *
 * Importa porque `lastInboundAt` es lo que abre la ventana de 24 h: sellar con
 * la hora de ingesta haría que una reentrega tardía —Zernio reintenta con
 * backoff de hasta 24 h, y su panel permite reenviar a mano— pareciera un
 * mensaje recién llegado, y el CRM ofrecería escribir libre por una ventana
 * que en realidad ya se cerró. El envío lo rechazaría la plataforma, y el
 * operador no tendría forma de entender por qué.
 *
 * Sin `sentAt` utilizable se cae a la hora actual: es lo que había antes y
 * nunca es peor.
 */
export function zernioSentAtSeconds(sentAt: string | undefined): string {
  const ms = sentAt ? Date.parse(sentAt) : NaN;
  return String(Math.floor((Number.isFinite(ms) ? ms : Date.now()) / 1000));
}

/** Lee el cuerpo crudo como evento de Zernio; null si no lo es. */
export function parseZernioEvent(rawBody: string): ZernioEvent | null {
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const evt = parsed as ZernioEvent;
    // Un payload de Meta trae `object`; uno de Zernio trae `account`. Sin
    // `account` no hay a quién enrutar, así que no es un evento utilizable.
    return evt.account ? evt : null;
  } catch {
    return null;
  }
}

/** `true` si el cuerpo es un webhook de Meta (y por tanto NO de Zernio). */
export function looksLikeMetaPayload(payload: unknown, object: string): boolean {
  return (
    typeof payload === "object" &&
    payload !== null &&
    (payload as { object?: string }).object === object
  );
}

export type ZernioSendResult = { platformMessageId: string };

/**
 * Responde en una conversación de Zernio.
 *
 * `accountId` va en el cuerpo aunque la conversación ya lo implique (lo exige
 * la API). `Idempotency-Key` evita que un reintento mande el mensaje dos
 * veces: la llave natural es el id que Vocero ya generó para ese envío.
 */
export async function sendZernioMessage(input: {
  token: string;
  accountId: string | null;
  conversationId: string | null;
  text: string;
  /** Fuera de la ventana de 24 h, la única etiqueta admitida. */
  humanAgentTag?: boolean;
  idempotencyKey?: string;
}): Promise<ZernioSendResult> {
  if (!input.conversationId) {
    throw new MetaApiError(
      "La conversación no tiene referencia de hilo en Zernio",
      { status: 400 }
    );
  }

  const body: Record<string, unknown> = {
    accountId: input.accountId,
    message: input.text,
  };
  if (input.humanAgentTag) {
    body.messagingType = "MESSAGE_TAG";
    body.messageTag = "HUMAN_AGENT";
  }

  const res = await zernioFetch(
    `/inbox/conversations/${encodeURIComponent(input.conversationId)}/messages`,
    {
      method: "POST",
      token: input.token,
      body,
      ...(input.idempotencyKey
        ? { headers: { "Idempotency-Key": input.idempotencyKey } }
        : {}),
    }
  );

  // La API responde `{ success, data: { messageId } }`. Las otras dos formas
  // son las que se leían antes de la 022 y se conservan por si acaso; sin
  // ninguna, un id propio para que el mensaje no se quede sin referencia.
  const id =
    (res as { data?: { messageId?: string } }).data?.messageId ??
    (res as { message?: { id?: string }; id?: string }).message?.id ??
    (res as { id?: string }).id ??
    `zernio_${Date.now()}`;
  return { platformMessageId: String(id) };
}

/**
 * 072 — Pone (`emoji` con valor) o quita (`emoji` = "") la reacción del
 * negocio a un mensaje de una conversación de Zernio.
 *
 * API: `POST /inbox/conversations/{conversationId}/messages/{messageId}/reactions`
 * `{ accountId, emoji }` y `DELETE` en el mismo path con `?accountId=`
 * (docs.zernio.com, «Add/Remove message reaction»). `messageId` acepta el id
 * de Zernio o el de la plataforma.
 */
export async function reactZernioMessage(input: {
  token: string;
  accountId: string | null;
  conversationId: string | null;
  messageId: string;
  emoji: string;
}): Promise<void> {
  if (!input.conversationId) {
    throw new MetaApiError(
      "La conversación no tiene referencia de hilo en Zernio",
      { status: 400 }
    );
  }
  const path =
    `/inbox/conversations/${encodeURIComponent(input.conversationId)}` +
    `/messages/${encodeURIComponent(input.messageId)}/reactions`;
  if (input.emoji) {
    await zernioFetch(path, {
      method: "POST",
      token: input.token,
      body: { accountId: input.accountId, emoji: input.emoji },
      timeoutMs: 15_000,
    });
  } else {
    await zernioFetch(`${path}?accountId=${encodeURIComponent(input.accountId ?? "")}`, {
      method: "DELETE",
      token: input.token,
      timeoutMs: 15_000,
    });
  }
}

/** Comprueba que la llave sirve (se usa antes de guardar una conexión). */
export async function verifyZernioToken(token: string): Promise<void> {
  await zernioFetch("/inbox/conversations?limit=1", { token });
}

/**
 * Traduce los fallos de Zernio al MetaApiError que el resto del CRM ya sabe
 * interpretar — incluido `isAuthError`, que distingue una llave muerta de un
 * hipo transitorio y costó un incidente aprender.
 */
export async function zernioFetch(
  path: string,
  opts: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    /** 023: corta la espera; sin él, la del runtime. */
    timeoutMs?: number;
    token: string;
    body?: unknown;
    headers?: Record<string, string>;
  }
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${ZERNIO_BASE}${path}`, {
      method: opts.method ?? "GET",
      headers: {
        Authorization: `Bearer ${opts.token}`,
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(opts.headers ?? {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      ...(opts.timeoutMs ? { signal: AbortSignal.timeout(opts.timeoutMs) } : {}),
    });
  } catch (cause) {
    throw new MetaApiError("No se pudo contactar la API de Zernio", {
      status: 0,
      details: cause,
    });
  }

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // respuesta no-JSON: se conserva el texto crudo en los detalles
  }

  if (!res.ok) {
    const err = json as { error?: { message?: string } | string } | null;
    const message =
      typeof err?.error === "string"
        ? err.error
        : (err?.error?.message ?? `HTTP ${res.status}`);
    throw new MetaApiError(message, {
      status: res.status,
      details: json ?? text,
    });
  }
  return json;
}
