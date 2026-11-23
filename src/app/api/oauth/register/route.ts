import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { redirectRegistrable } from "@/server/oauth/nucleo";
import { conCors, errorOAuth, ipDe, negocioOAuth, noExiste, preflight } from "@/server/oauth/puerta";
import { MAX_REDIRECTS, registrarCliente } from "@/server/oauth/servidor";

export const dynamic = "force-dynamic";

/** Registros por hora y por IP: un cliente legítimo se registra una vez. */
const REGISTROS_POR_HORA = 20;

const esquema = z.object({
  client_name: z.string().trim().max(200).optional(),
  redirect_uris: z.array(z.string()).min(1).max(MAX_REDIRECTS),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  token_endpoint_auth_method: z.string().optional(),
});

/**
 * RFC 7591 — Registro dinámico. Cualquiera puede registrar un cliente (así lo
 * pide el MCP), pero un cliente no abre nada: hace falta que una persona del
 * negocio lo acepte en la pantalla de consentimiento. Todos son públicos
 * (sin secreto, con PKCE) y quedan atados al negocio de esta instancia.
 */
export async function POST(req: Request) {
  const negocio = await negocioOAuth();
  if (!negocio) return noExiste();
  const limite = checkRateLimit(`oauth_register:${ipDe(req)}`, { windowMs: 3_600_000, max: REGISTROS_POR_HORA });
  if (!limite.allowed) return errorOAuth(429, "slow_down", "Demasiados registros desde esta IP; espera una hora");

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return errorOAuth(400, "invalid_client_metadata", "El cuerpo debe ser JSON");
  }
  const p = esquema.safeParse(cuerpo);
  if (!p.success) return errorOAuth(400, "invalid_client_metadata", "Faltan redirect_uris o el formato no es válido");
  const malos = p.data.redirect_uris.filter((u) => !redirectRegistrable(u));
  if (malos.length > 0) {
    return errorOAuth(400, "invalid_redirect_uri", "redirect_uri debe ser https, http de loopback o el esquema propio de una app");
  }
  const metodo = p.data.token_endpoint_auth_method ?? "none";
  if (metodo !== "none") {
    return errorOAuth(400, "invalid_client_metadata", "Solo clientes públicos: token_endpoint_auth_method=none con PKCE");
  }
  if (p.data.grant_types?.some((g) => g !== "authorization_code" && g !== "refresh_token")) {
    return errorOAuth(400, "invalid_client_metadata", "grant_types admitidos: authorization_code y refresh_token");
  }

  const nombre = (p.data.client_name || "App sin nombre").replace(/[\u0000-\u001f]/g, "").slice(0, 80);
  const cliente = await registrarCliente(negocio.id, nombre, [...new Set(p.data.redirect_uris)]);
  console.info(`[oauth] cliente registrado ${cliente.id} «${nombre}»`);
  return conCors(
    Response.json(
      {
        client_id: cliente.id,
        client_id_issued_at: Math.floor(cliente.createdAt.getTime() / 1000),
        client_name: cliente.name,
        redirect_uris: cliente.redirectUris,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    )
  );
}

export const OPTIONS = preflight;
