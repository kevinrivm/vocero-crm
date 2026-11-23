import { requireSession } from "@/lib/auth/session";
import { rolPuede } from "@/server/api-v1/acceso";
import { validarAutorizacion } from "@/server/oauth/autorizar";
import { normalizar, OAUTH_SCOPES, urlDeRegreso, type OAuthScope } from "@/server/oauth/nucleo";
import { mismoOrigen, negocioOAuth, noExiste } from "@/server/oauth/puerta";
import { emitirCodigo } from "@/server/oauth/servidor";

export const dynamic = "force-dynamic";

const ver = (url: string) => new Response(null, { status: 303, headers: { Location: url, "Cache-Control": "no-store" } });

/**
 * El botón de la pantalla de consentimiento. Es un formulario normal del CRM:
 * exige la sesión de la instancia y que venga de este mismo origen, y
 * vuelve a validar todo lo que la página ya validó (el formulario se puede
 * fabricar).
 */
export async function POST(req: Request) {
  const negocio = await negocioOAuth();
  if (!negocio) return noExiste();
  if (!mismoOrigen(req)) return new Response("La solicitud debe proceder de este CRM", { status: 403 });

  let session;
  try {
    session = await requireSession();
  } catch {
    return new Response("Inicia sesión en este CRM para autorizar la app", { status: 401 });
  }
  if (session.organizationId !== negocio.id) return new Response("Tu cuenta no es de este negocio", { status: 403 });

  const form = await req.formData().catch(() => null);
  if (!form) return new Response("Formulario ilegible", { status: 400 });
  const campo = (n: string) => {
    const v = form.get(n);
    return typeof v === "string" ? v : null;
  };
  const v = await validarAutorizacion(negocio, { get: campo });
  if (!v.ok) return "redirigir" in v ? ver(v.redirigir) : new Response(v.mostrar, { status: 400 });
  const { peticion } = v;

  if (campo("decision") !== "permitir") {
    return ver(urlDeRegreso(peticion.redirectUri, {
      error: "access_denied",
      error_description: "La persona no autorizó la app",
      state: peticion.state,
      iss: negocio.origen,
    }));
  }

  // Lo marcado en la pantalla, sin pasar de lo que la app pidió ni de lo que
  // esta persona puede: configurar solo lo concede un dueño o administrador.
  const marcados = form.getAll("permiso").filter((x): x is string => typeof x === "string");
  const elegidos: OAuthScope[] = normalizar(
    OAUTH_SCOPES.filter((s) => marcados.includes(s) && peticion.scopes.includes(s))
  ).filter((s) => rolPuede(session.role, s));
  if (!elegidos.includes("read")) {
    return ver(urlDeRegreso(peticion.redirectUri, {
      error: "access_denied",
      error_description: "Sin permisos que conceder",
      state: peticion.state,
      iss: negocio.origen,
    }));
  }

  const code = await emitirCodigo({
    organizationId: negocio.id,
    clientId: peticion.client.id,
    userId: session.userId,
    scopes: elegidos,
    redirectUri: peticion.redirectUri,
    codeChallenge: peticion.codeChallenge,
  });
  console.info(`[oauth] ${session.userId} autorizó ${peticion.client.id} (${elegidos.join(" ")})`);
  return ver(urlDeRegreso(peticion.redirectUri, { code, state: peticion.state, iss: negocio.origen }));
}
