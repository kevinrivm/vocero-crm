import { challengeValido, parsearScopes, recursoValido, redirectCoincide, urlDeRegreso, type OAuthScope } from "./nucleo";
import type { NegocioOAuth } from "./puerta";
import { clienteDe } from "./servidor";

/**
 * Valida una petición de `/oauth/authorize` (la página y su POST comparten
 * esto). Mientras no se sepa que el cliente y su redirect_uri son buenos, el
 * error se ENSEÑA y no se redirige: redirigir a un URI sin validar convierte
 * la pantalla en un redireccionador abierto (RFC 6749 §4.1.2.1).
 */
export type PeticionAutorizar = {
  client: { id: string; name: string };
  redirectUri: string;
  state?: string;
  codeChallenge: string;
  scopes: OAuthScope[];
  resource?: string;
};

export type ResultadoValidar =
  | { ok: true; peticion: PeticionAutorizar }
  | { ok: false; mostrar: string }
  | { ok: false; redirigir: string };

export async function validarAutorizacion(
  negocio: NegocioOAuth,
  p: { get(nombre: string): string | null }
): Promise<ResultadoValidar> {
  const clientId = p.get("client_id");
  const redirectUri = p.get("redirect_uri");
  const client = await clienteDe(negocio.id, clientId);
  if (!client) {
    return { ok: false, mostrar: "Esta app no está registrada en este negocio. Vuelve a conectar desde la app." };
  }
  if (!redirectUri || !redirectCoincide(client.redirectUris, redirectUri)) {
    return { ok: false, mostrar: "La dirección de regreso no coincide con la que registró la app." };
  }
  const state = p.get("state") ?? undefined;
  const volver = (error: string, descripcion: string) => ({
    ok: false as const,
    redirigir: urlDeRegreso(redirectUri, { error, error_description: descripcion, state, iss: negocio.origen }),
  });
  if (p.get("response_type") !== "code") return volver("unsupported_response_type", "Solo response_type=code");
  const challenge = p.get("code_challenge");
  if (!challengeValido(challenge) || p.get("code_challenge_method") !== "S256") {
    return volver("invalid_request", "PKCE obligatorio: code_challenge con code_challenge_method=S256");
  }
  const resource = p.get("resource") ?? undefined;
  if (!recursoValido(negocio.origen, resource)) return volver("invalid_target", "resource no es el MCP de este negocio");
  return {
    ok: true,
    peticion: {
      client: { id: client.id, name: client.name },
      redirectUri,
      state,
      codeChallenge: challenge,
      scopes: parsearScopes(p.get("scope")),
      resource,
    },
  };
}

/** Lo que se le enseña a la persona para que sepa adónde vuelve: el host, no el nombre que dice la app. */
export function destinoVisible(redirectUri: string): string {
  try {
    const u = new URL(redirectUri);
    return u.host || `${u.protocol}//`;
  } catch {
    return redirectUri;
  }
}
