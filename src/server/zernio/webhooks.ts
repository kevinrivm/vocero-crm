import { createHash } from "node:crypto";
import { zernioFetch } from "@/server/zernio";
import type { Health } from "@/server/zernio/cuentas";

/**
 * 023 — Los webhooks de Zernio que entregan a esta instancia.
 *
 * Zernio guarda la verdad de dos cosas que antes se capturaban a mano y se
 * capturaban mal: con qué secreto firma, y si el webhook existe, está activo y
 * cubre la cuenta. Aquí se leen con la llave ya guardada.
 *
 * Un webhook «apunta aquí» si su URL lleva el segmento secreto de esta
 * instancia. Los demás webhooks de esa llave (otro CRM, otra herramienta del
 * negocio) no se usan para nada y jamás se modifican.
 */

/** El evento con el que llega un mensaje de un cliente. */
export const ZERNIO_MESSAGE_EVENT = "message.received";
/** 072 — Las reacciones del cliente llegan en su propio evento. */
export const ZERNIO_REACTION_EVENT = "reaction.received";

/** Un webhook de `GET /webhooks/settings`, en lo que a Vocero le importa. */
export type ZernioWebhook = {
  _id: string;
  name?: string | null;
  url?: string | null;
  secret?: string | null;
  events?: string[] | null;
  isActive?: boolean;
  /** Vacío = todas las cuentas de esa llave. */
  accountIds?: string[] | null;
  failureCount?: number | null;
  lastFiredAt?: string | null;
};

/** Cuánto vale una lectura buena, y cuánto se recuerda un fallo. */
export const WEBHOOKS_OK_MS = 10 * 60 * 1000;
export const WEBHOOKS_FAIL_MS = 60 * 1000;
/**
 * Cuando una firma no coincide con lo leído, se relee si la lectura tiene más
 * de esto: es lo que tarda el CRM en enterarse de que el secreto cambió en
 * Zernio, y también el tope de consultas que alguien puede provocar mandando
 * firmas inválidas (una por minuto y por llave).
 */
export const WEBHOOKS_RECHECK_MS = 60 * 1000;

type Entry = { at: number; ok: boolean; webhooks: ZernioWebhook[] };

// En globalThis porque Next recarga módulos en desarrollo; una instancia es un
// proceso, así que la memoria alcanza. La llave nunca es la del mapa: su hash.
const g = globalThis as unknown as { __voceroZernioWebhooks?: Map<string, Entry> };
function cache(): Map<string, Entry> {
  if (!g.__voceroZernioWebhooks) g.__voceroZernioWebhooks = new Map();
  return g.__voceroZernioWebhooks;
}
const keyOf = (token: string) => createHash("sha256").update(token).digest("hex");

/** Los webhooks de esa llave, sin caché. Lanza `MetaApiError` si Zernio falla. */
export async function fetchZernioWebhooks(token: string): Promise<ZernioWebhook[]> {
  const json = (await zernioFetch("/webhooks/settings", { token, timeoutMs: 5000 })) as {
    webhooks?: ZernioWebhook[];
  } | null;
  const webhooks = Array.isArray(json?.webhooks) ? json.webhooks : [];
  cache().set(keyOf(token), { at: Date.now(), ok: true, webhooks });
  return webhooks;
}

/**
 * Lo mismo, con caché y sin lanzar: es lo que usa la verificación de firma,
 * que corre en cada entrega. Un fallo se recuerda un minuto para que una
 * ráfaga de entregas con Zernio caído no se convierta en una ráfaga de
 * consultas; la última lectura buena se sigue usando mientras tanto.
 *
 * `maxAgeMs` pide una lectura más fresca que la de por defecto (solo acorta
 * la vida de una lectura buena; un fallo se sigue recordando su minuto).
 */
export async function cachedZernioWebhooks(
  token: string,
  maxAgeMs: number = WEBHOOKS_OK_MS
): Promise<{ ok: boolean; webhooks: ZernioWebhook[] }> {
  const key = keyOf(token);
  const hit = cache().get(key);
  const vida = hit?.ok ? Math.min(WEBHOOKS_OK_MS, maxAgeMs) : WEBHOOKS_FAIL_MS;
  if (hit && Date.now() - hit.at < vida) {
    return { ok: hit.ok, webhooks: hit.webhooks };
  }
  try {
    return { ok: true, webhooks: await fetchZernioWebhooks(token) };
  } catch {
    const webhooks = hit?.webhooks ?? [];
    cache().set(key, { at: Date.now(), ok: false, webhooks });
    return { ok: false, webhooks };
  }
}

export function forgetZernioWebhooks(token: string): void {
  cache().delete(keyOf(token));
}

/** Puro: ¿la URL de ese webhook lleva el segmento secreto de esta instancia? */
export function pointsHere(webhook: ZernioWebhook, segment: string): boolean {
  if (!segment || typeof webhook.url !== "string") return false;
  try {
    return new URL(webhook.url).pathname.split("/").includes(segment);
  } catch {
    return false;
  }
}

/** Puro: activo, con el evento de mensajes y con esa cuenta dentro de su límite. */
export function coversAccount(webhook: ZernioWebhook, accountId: string): boolean {
  if (webhook.isActive === false) return false;
  const events = webhook.events ?? [];
  if (events.length > 0 && !events.includes(ZERNIO_MESSAGE_EVENT)) return false;
  const accounts = webhook.accountIds ?? [];
  return accounts.length === 0 || accounts.includes(accountId);
}

/** Los secretos con los que Zernio firma lo que entrega a esta instancia. */
export async function webhookSecretsFromZernio(
  token: string,
  segment: string,
  maxAgeMs?: number
): Promise<string[]> {
  const { webhooks } = await cachedZernioWebhooks(token, maxAgeMs);
  return webhooks
    .filter((w) => pointsHere(w, segment))
    .map((w) => w.secret)
    .filter((s): s is string => typeof s === "string" && s.length > 0);
}

export type WebhookHealth = Health & {
  lastFiredAt: string | null;
  failureCount: number;
};

/** Puro: cómo está el webhook para una cuenta concreta. */
export function webhookHealth(
  webhooks: readonly ZernioWebhook[],
  segment: string,
  accountId: string
): WebhookHealth {
  const aqui = webhooks.filter((w) => pointsHere(w, segment));
  const nada = { lastFiredAt: null, failureCount: 0 };
  if (aqui.length === 0) {
    return {
      level: "error",
      message: "Zernio no tiene un webhook hacia esta instancia: los mensajes no llegan.",
      ...nada,
    };
  }
  const activos = aqui.filter((w) => w.isActive !== false);
  if (activos.length === 0) {
    return {
      level: "error",
      message: "El webhook hacia esta instancia está desactivado en Zernio.",
      ...nada,
    };
  }
  const cubre = activos.find((w) => coversAccount(w, accountId));
  if (!cubre) {
    const sinEvento = activos.some(
      (w) => (w.events ?? []).length > 0 && !(w.events ?? []).includes(ZERNIO_MESSAGE_EVENT)
    );
    return {
      level: "error",
      message: sinEvento
        ? `El webhook no está suscrito a «${ZERNIO_MESSAGE_EVENT}».`
        : "El webhook no incluye esta cuenta: sus mensajes no llegan.",
      ...nada,
    };
  }
  const failureCount = cubre.failureCount ?? 0;
  const lastFiredAt = cubre.lastFiredAt ?? null;
  if (failureCount > 0) {
    return {
      level: "warn",
      message: `Zernio registra ${failureCount} ${failureCount === 1 ? "entrega fallida" : "entregas fallidas"} seguidas.`,
      lastFiredAt,
      failureCount,
    };
  }
  return { level: "ok", message: "Activo", lastFiredAt, failureCount };
}

/**
 * Deja UN webhook de esa llave apuntando aquí, con el evento de mensajes, el
 * secreto dado y limitado a esas cuentas. Si ya hay uno que apunta aquí (o que
 * lleva el nombre de esta instancia, que es lo que queda cuando se rotó el
 * segmento secreto), se actualiza en vez de crear otro.
 *
 * El límite de cuentas no es un detalle: un webhook sin él recibe los mensajes
 * de TODAS las cuentas de la llave, y la llave de una agencia ve las de sus
 * clientes.
 */
export async function ensureZernioWebhook(input: {
  token: string;
  segment: string;
  name: string;
  url: string;
  /** Mantiene la URL del webhook existente si es una de estas. */
  acceptableUrls: readonly string[];
  accountIds: readonly string[];
  secret: string;
}): Promise<{ created: boolean; id: string }> {
  const existentes = await fetchZernioWebhooks(input.token);
  const previo =
    existentes.find((w) => pointsHere(w, input.segment) && w.isActive !== false) ??
    existentes.find((w) => pointsHere(w, input.segment)) ??
    existentes.find((w) => w.name === input.name);

  const url =
    previo?.url && input.acceptableUrls.includes(previo.url) ? previo.url : input.url;
  const body = {
    name: previo?.name || input.name,
    url,
    // 072: también las reacciones del cliente (D9).
    events: [ZERNIO_MESSAGE_EVENT, ZERNIO_REACTION_EVENT],
    secret: input.secret,
    isActive: true,
    accountIds: [...new Set(input.accountIds)],
  };

  const json = (await zernioFetch("/webhooks/settings", {
    method: previo ? "PUT" : "POST",
    token: input.token,
    body: previo ? { webhookId: previo._id, ...body } : body,
    timeoutMs: 10_000,
  })) as { webhook?: { _id?: string } } | null;
  forgetZernioWebhooks(input.token);

  const id = json?.webhook?._id ?? previo?._id;
  if (!id) throw new Error("Zernio respondió sin el webhook");
  return { created: !previo, id };
}
