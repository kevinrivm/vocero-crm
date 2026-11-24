import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { leerSesion } from "@/lib/auth/leer-sesion";
import { rolPuede } from "@/server/api-v1/acceso";
import { destinoVisible, validarAutorizacion } from "@/server/oauth/autorizar";
import { OAUTH_SCOPES, PERMISOS_OAUTH } from "@/server/oauth/nucleo";
import { negocioOAuth } from "@/server/oauth/puerta";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Los parámetros que viajan de la página al POST, tal cual llegaron. */
const CAMPOS = ["response_type", "client_id", "redirect_uri", "state", "code_challenge", "code_challenge_method", "scope", "resource"];

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
        <CardDescription>{texto}</CardDescription>
      </CardHeader>
    </Card>
  );
}

/**
 * 069 — Pantalla de consentimiento del OAuth del MCP.
 *
 * Vive en la propia instancia, donde la persona ya inicia sesión: el
 * token que salga de aquí queda atado a ella y a este negocio. Dice qué app
 * pide acceso, a qué negocio, adónde volverá y con qué permisos; configurar
 * el agente solo lo puede conceder un dueño o administrador.
 */
export default async function AutorizarPage({ searchParams }: Props) {
  const negocio = await negocioOAuth();
  if (!negocio) notFound();

  const sp = await searchParams;
  const valor = (n: string) => {
    const v = sp[n];
    return typeof v === "string" ? v : null;
  };
  const v = await validarAutorizacion(negocio, { get: valor });
  if (!v.ok) {
    if ("redirigir" in v) redirect(v.redirigir);
    return <Aviso titulo="No se puede conectar esta app" texto={v.mostrar} />;
  }
  const { peticion } = v;

  const session = await getSessionOrNull();
  if (!session || session.organizationId !== negocio.id) {
    // ¿Hay sesión pero de alguien sin acceso a este negocio? Mandarlo al login
    // sería un ciclo: se le explica.
    const cruda = await leerSesion(await headers()).catch(() => null);
    if (cruda) {
      return (
        <Aviso
          titulo="Tu cuenta no tiene acceso a este negocio"
          texto={`Entraste como ${cruda.user.email}, que no es parte de «${negocio.name}». Pide que te inviten o entra con otra cuenta.`}
        />
      );
    }
    const aqui = `/oauth/authorize?${new URLSearchParams(
      CAMPOS.flatMap((c) => (valor(c) !== null ? [[c, valor(c)!]] : []))
    ).toString()}`;
    redirect(`/login?next=${encodeURIComponent(aqui)}`);
  }

  const usuario = await leerSesion(await headers())
    .then((s) => s?.user ?? null)
    .catch(() => null);
  const permisos = OAUTH_SCOPES.filter((s) => peticion.scopes.includes(s));
  const vuelveA = destinoVisible(peticion.redirectUri);

  return (
    <Card className="shadow-md" data-testid="consentimiento-oauth">
      <CardHeader>
        <CardTitle>Conectar «{peticion.client.name}»</CardTitle>
        <CardDescription>
          Esta app pide acceso a <span className="font-semibold text-foreground">{negocio.name}</span> en tu
          nombre{usuario ? ` (${usuario.email})` : ""}. Al aceptar volverás a{" "}
          <span className="break-all font-mono text-foreground">{vuelveA}</span>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form method="post" action="/api/oauth/authorize" className="space-y-4">
          {CAMPOS.map((c) => {
            const x = valor(c);
            return x === null ? null : <input key={c} type="hidden" name={c} value={x} />;
          })}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Podrá:</legend>
            {permisos.map((s) => {
              const puede = rolPuede(session.role, s);
              return (
                <label key={s} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="permiso"
                    value={s}
                    className="mt-1"
                    defaultChecked={puede}
                    disabled={!puede || s === "read"}
                  />
                  {/* Un checkbox deshabilitado no viaja: leer va siempre. */}
                  {s === "read" && <input type="hidden" name="permiso" value="read" />}
                  <span>
                    <span className="font-semibold">{PERMISOS_OAUTH[s].titulo}</span>
                    <span className="block text-xs text-text-3">
                      {puede ? PERMISOS_OAUTH[s].detalle : "Solo un dueño o administrador del negocio puede conceder esto."}
                    </span>
                  </span>
                </label>
              );
            })}
          </fieldset>
          <p className="text-xs text-text-3">
            La app actuará con tus permisos y solo sobre este negocio. No puede escribirle a tus clientes. Puedes
            desconectarla cuando quieras en Ajustes → API.
          </p>
          <div className="flex gap-2">
            <Button type="submit" name="decision" value="permitir" className="flex-1">
              Permitir
            </Button>
            <Button type="submit" name="decision" value="cancelar" variant="outline">
              Cancelar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
