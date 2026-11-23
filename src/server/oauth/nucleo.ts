import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * 069 — Las piezas puras del OAuth del MCP: sin base de datos ni
 * cabeceras, para poder probarlas solas.
 *
 * Es OAuth 2.1 recortado a lo que pide la especificación de autorización del
 * MCP: clientes públicos con PKCE (S256), código de autorización, refresco
 * que rota, revocación, registro dinámico y los dos documentos `.well-known`.
 */

/** Lo que se puede conceder. `send` no existe por OAuth: el MCP no le escribe al cliente. */
export const OAUTH_SCOPES = ["read", "operate", "configure"] as const;
export type OAuthScope = (typeof OAUTH_SCOPES)[number];

export const PERMISOS_OAUTH: Record<OAuthScope, { titulo: string; detalle: string }> = {
  read: { titulo: "Leer", detalle: "Ver contactos, conversaciones, embudo, citas y la configuración." },
  operate: { titulo: "Operar", detalle: "Crear y editar contactos, mover leads, dejar notas y agendar citas." },
  configure: {
    titulo: "Configurar el agente",
    detalle: "Instrucciones, conocimiento, agenda, etapas, respuestas rápidas y la llave de la IA.",
  },
};

/** Vidas: el código es de un solo uso y corto; el acceso caduca pronto; el refresco rota. */
export const VIDA_CODIGO_MS = 10 * 60_000;
export const VIDA_ACCESO_S = 60 * 60;
export const VIDA_REFRESCO_MS = 30 * 24 * 60 * 60_000;

export const PREFIJO_ACCESO = "vat_";
export const PREFIJO_REFRESCO = "vrt_";
export const PREFIJO_CODIGO = "vco_";

export function hashToken(valor: string): string {
  return createHash("sha256").update(valor).digest("hex");
}

export function nuevoToken(prefijo: string): { valor: string; hash: string } {
  const valor = prefijo + randomBytes(32).toString("base64url");
  return { valor, hash: hashToken(valor) };
}

/** `scope` de la petición → los que existen, en orden. Vacío o sin ninguno conocido = todos. */
export function parsearScopes(pedido: string | null | undefined): OAuthScope[] {
  const pedidos = new Set((pedido ?? "").split(/\s+/).filter(Boolean));
  const conocidos = OAUTH_SCOPES.filter((s) => pedidos.has(s));
  return conocidos.length > 0 ? normalizar(conocidos) : [...OAUTH_SCOPES];
}

/** Leer va siempre: sin él no hay nada que operar ni configurar. */
export function normalizar(scopes: readonly string[]): OAuthScope[] {
  const set = new Set<string>(["read", ...scopes]);
  return OAUTH_SCOPES.filter((s) => set.has(s));
}

/** PKCE S256 (RFC 7636). `plain` no se acepta. */
export function verificarPkce(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  const calculado = Buffer.from(createHash("sha256").update(verifier).digest("base64url"));
  const esperado = Buffer.from(challenge);
  return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
}

export function challengeValido(challenge: string | null | undefined): challenge is string {
  return typeof challenge === "string" && /^[A-Za-z0-9\-_]{43}$/.test(challenge);
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
const ESQUEMAS_PROHIBIDOS = new Set(["javascript:", "data:", "file:", "vbscript:", "blob:", "about:"]);

/**
 * ¿Se puede registrar este redirect_uri? https, http solo de loopback (apps
 * de escritorio como Claude Code), o un esquema propio de app (`cursor://…`).
 * Nunca un fragmento.
 */
export function redirectRegistrable(uri: string): boolean {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.hash || uri.length > 500) return false;
  if (u.protocol === "https:") return true;
  if (u.protocol === "http:") return LOOPBACK.has(u.hostname);
  return !ESQUEMAS_PROHIBIDOS.has(u.protocol) && /^[a-z][a-z0-9+.-]*:$/.test(u.protocol);
}

/**
 * ¿El redirect_uri de la petición es uno de los registrados? Comparación
 * exacta, salvo el puerto de loopback, que la app nativa elige al vuelo
 * (RFC 8252 §7.3).
 */
export function redirectCoincide(registrados: readonly string[], pedido: string): boolean {
  if (registrados.includes(pedido)) return true;
  let p: URL;
  try {
    p = new URL(pedido);
  } catch {
    return false;
  }
  if (p.protocol !== "http:" || !LOOPBACK.has(p.hostname)) return false;
  return registrados.some((r) => {
    try {
      const u = new URL(r);
      return (
        u.protocol === "http:" &&
        u.hostname === p.hostname &&
        u.pathname === p.pathname &&
        u.search === p.search
      );
    } catch {
      return false;
    }
  });
}

/** La URL de regreso al cliente con sus parámetros (`code`, `state`, `iss` o `error`). */
export function urlDeRegreso(redirectUri: string, params: Record<string, string | undefined>): string {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) u.searchParams.set(k, v);
  return u.toString();
}

/** La ruta del MCP: el «recurso protegido» de la RFC 9728. */
export const RUTA_MCP = "/api/v1/mcp";
export const RUTA_METADATOS_RECURSO = "/.well-known/oauth-protected-resource";

export function urlMetadatosRecurso(origen: string): string {
  return `${origen}${RUTA_METADATOS_RECURSO}${RUTA_MCP}`;
}

/** RFC 9728: dónde está el servidor de autorización de este recurso. */
export function metadatosRecurso(origen: string) {
  return {
    resource: `${origen}${RUTA_MCP}`,
    authorization_servers: [origen],
    scopes_supported: [...OAUTH_SCOPES],
    bearer_methods_supported: ["header"],
    resource_name: "Vocero CRM",
    resource_documentation: `${origen}/settings/api/docs`,
  };
}

/** RFC 8414: el servidor de autorización es la propia instancia (`APP_BASE_URL`). */
export function metadatosServidor(origen: string) {
  return {
    issuer: origen,
    authorization_endpoint: `${origen}/oauth/authorize`,
    token_endpoint: `${origen}/api/oauth/token`,
    registration_endpoint: `${origen}/api/oauth/register`,
    revocation_endpoint: `${origen}/api/oauth/revoke`,
    scopes_supported: [...OAUTH_SCOPES],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    service_documentation: `${origen}/settings/api/docs`,
  };
}

/**
 * ¿El `resource` (RFC 8707) que pide el cliente es este MCP? Se acepta el
 * MCP, el origen de la instancia o nada; cualquier otro es un token pedido para
 * otro servidor.
 */
export function recursoValido(origen: string, resource: string | null | undefined): boolean {
  if (!resource) return true;
  const limpio = resource.replace(/\/+$/, "");
  return limpio === origen || limpio === `${origen}${RUTA_MCP}`;
}

export { siguienteSeguro } from "@/lib/oauth-next";
