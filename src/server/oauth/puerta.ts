import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { apiV1Enabled } from "@/server/api-v1/flag";
import { resolveInstanceOrg } from "@/server/bot/auth";

/**
 * 069 — Dónde existe el OAuth: en la instancia con la API encendida
 * (`API_V1=on`), y en ningún otro caso. Igual que la API, donde está apagada
 * todo es 404 — ni los `.well-known` delatan que existe.
 *
 * Una instancia es un negocio: el servidor de autorización es el origen de
 * `APP_BASE_URL` y todo lo que emite es de la organización de la instancia.
 */
export type NegocioOAuth = { id: string; name: string; origen: string };

/** El origen público de la instancia (`APP_BASE_URL` sin ruta ni barra final). */
export function origenInstancia(): string {
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  try {
    return new URL(base).origin;
  } catch {
    return base.replace(/\/+$/, "");
  }
}

export async function negocioOAuth(): Promise<NegocioOAuth | null> {
  if (!apiV1Enabled()) return null;
  const orgId = await resolveInstanceOrg();
  if (!orgId) return null;
  const [org] = await getDb()
    .select({ id: schema.organization.id, name: schema.organization.name })
    .from(schema.organization)
    .where(eq(schema.organization.id, orgId))
    .limit(1);
  if (!org) return null;
  return { id: org.id, name: org.name, origen: origenInstancia() };
}

export const noExiste = () => new Response(null, { status: 404 });

/**
 * CORS abierto para lo que llaman los clientes desde el navegador (metadatos,
 * registro, token, revocación). No hay cookies en juego: lo que autoriza va
 * en el cuerpo, así que abrirlo no presta ninguna credencial ambiental.
 */
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, mcp-protocol-version",
  "Access-Control-Max-Age": "86400",
};

export function conCors(res: Response): Response {
  for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
  return res;
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS });
}

/** Error con la forma de OAuth (`error`, `error_description`), sin caché. */
export function errorOAuth(status: number, error: string, descripcion: string): Response {
  return conCors(
    Response.json(
      { error, error_description: descripcion },
      { status, headers: { "Cache-Control": "no-store" } }
    )
  );
}

/** El cuerpo de token/revoke: `application/x-www-form-urlencoded` (lo normal) o JSON. */
export async function leerFormulario(req: Request): Promise<Record<string, string> | null> {
  const tipo = req.headers.get("content-type") ?? "";
  try {
    if (tipo.includes("application/json")) {
      const j = (await req.json()) as unknown;
      if (!j || typeof j !== "object" || Array.isArray(j)) return null;
      return Object.fromEntries(
        Object.entries(j as Record<string, unknown>).filter(([, v]) => typeof v === "string") as [string, string][]
      );
    }
    const texto = await req.text();
    if (texto.length > 10_000) return null;
    return Object.fromEntries(new URLSearchParams(texto));
  } catch {
    return null;
  }
}

/**
 * ¿El formulario salió de esta misma instancia? `Origin` (o, si el navegador
 * no lo manda, `Referer`) tiene que ser el origen de `APP_BASE_URL`. La cookie
 * de sesión ya es `SameSite=Lax`; esto cierra también un navegador viejo.
 */
export function mismoOrigen(req: Request): boolean {
  const esperado = origenInstancia();
  const origin = req.headers.get("origin");
  if (origin) return origin === esperado;
  const referer = req.headers.get("referer");
  if (!referer) return false;
  try {
    return new URL(referer).origin === esperado;
  } catch {
    return false;
  }
}

export function ipDe(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "sin-ip";
}
