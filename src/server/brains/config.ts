/**
 * 021 — ¿Hay un cerebro al que despacharle? Dos cosas, y las dos por entorno:
 * `BRAIN_DISPATCH_URL` (a dónde) y `BOT_API_KEY` (con qué se firma, y con qué
 * contesta el cerebro por `/api/bot/*`).
 *
 * 036 — Es el único camino por el que alguien contesta (el CRM no trae
 * agente), y además hace falta el interruptor del Agente encendido. Mal
 * configurado NO está activo: la instancia queda como bandeja manual y la
 * tarjeta «Quién responde» dice qué corregir.
 *
 * A diferencia de la edición cloud, aquí no se exige una URL pública: la pone
 * quien instala, no un tercero, y lo normal es la dirección interna del
 * contenedor del cerebro (`http://nea:8000/vocero/dispatch`).
 */

import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

const MIN_KEY_LENGTH = 16;

export type ProblemaDespacho =
  /** `BRAIN_DISPATCH_URL` no es una URL http(s), o lleva usuario y clave. */
  | "url"
  /** Falta `BOT_API_KEY` (o mide menos de 16): no hay con qué firmar. */
  | "sin_llave";

export type ConfigDespacho =
  | { active: true; url: string; host: string; secret: string }
  | { active: false; host: string | null; problem: ProblemaDespacho | null };

type Entorno = Record<string, string | undefined>;

/** Pura sobre el entorno que recibe: la usan el worker, la tarjeta y `pnpm doctor`. */
export function leerConfigDespacho(env: Entorno = process.env): ConfigDespacho {
  const raw = env.BRAIN_DISPATCH_URL?.trim();
  if (!raw) return { active: false, host: null, problem: null };

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return { active: false, host: null, problem: "url" };
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return { active: false, host: null, problem: "url" };
  }
  // Sin credenciales en la URL: el despacho ya va firmado, y `fetch` rechaza
  // una URL que las trae. Mejor decirlo que fallar en cada turno.
  if (target.username || target.password) {
    return { active: false, host: target.host, problem: "url" };
  }

  const secret = env.BOT_API_KEY;
  if (typeof secret !== "string" || secret.length < MIN_KEY_LENGTH) {
    return { active: false, host: target.host, problem: "sin_llave" };
  }
  return { active: true, url: target.toString(), host: target.host, secret };
}

/** El CRM está empujando turnos a un cerebro. */
export function despachoActivo(): boolean {
  return leerConfigDespacho().active;
}

/**
 * Lee la configuración de despacho para un tenant específico desde la base de datos,
 * con fallback a las variables de entorno globales si no tiene configuración propia.
 */
export async function leerConfigDespachoOrg(
  organizationId?: string | null
): Promise<ConfigDespacho> {
  if (organizationId) {
    try {
      const db = getDb();
      const [org] = await db
        .select({
          dispatchWebhookUrl: schema.organization.dispatchWebhookUrl,
          botApiKey: schema.organization.botApiKey,
        })
        .from(schema.organization)
        .where(eq(schema.organization.id, organizationId))
        .limit(1);

      if (org?.dispatchWebhookUrl) {
        return leerConfigDespacho({
          BRAIN_DISPATCH_URL: org.dispatchWebhookUrl,
          BOT_API_KEY:
            org.botApiKey && org.botApiKey.length >= MIN_KEY_LENGTH
              ? org.botApiKey
              : process.env.BOT_API_KEY && process.env.BOT_API_KEY.length >= MIN_KEY_LENGTH
                ? process.env.BOT_API_KEY
                : "nexia-default-dispatch-secret-key-32chars",
        });
      }
    } catch {
      // Fallback a entorno en caso de error o tests sin conexión a BD
    }
  }
  return leerConfigDespacho();
}

/**
 * Determina si el despacho al cerebro está activo para una organización específica.
 */
export async function despachoActivoOrg(organizationId?: string | null): Promise<boolean> {
  const conf = await leerConfigDespachoOrg(organizationId);
  return conf.active;
}

/**
 * 036 — A dónde preguntarle al cerebro si está sano: `BRAIN_HEALTH_URL` o, sin
 * ella, el `/health` del mismo origen del despacho (lo que sirve Nea). `null`
 * si no hay ninguna de las dos.
 */
export function urlSaludCerebro(env: Entorno = process.env): string | null {
  const directa = env.BRAIN_HEALTH_URL?.trim();
  if (directa) return directa;
  const despacho = leerConfigDespacho(env);
  if (!despacho.active) return null;
  return new URL("/health", despacho.url).toString();
}
