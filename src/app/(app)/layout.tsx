import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { getSessionOrNull } from "@/lib/auth/session";
import { leerSesion } from "@/lib/auth/leer-sesion";
import { aparienciaActual } from "@/server/apariencia";
import { getBranding } from "@/server/branding";
import { AppShell } from "@/components/app-shell";
import { SessionKeepalive } from "@/components/session-keepalive";
import { resolveCommit } from "@/lib/version";
import { agendaEnabled } from "@/server/agenda/flag";
import { enabledChannels } from "@/server/channels/enabled";
import { navKicker } from "@/lib/channels";
import { avisoIaDe } from "@/server/ai/aviso";
import { AvisoIaBanner } from "@/components/avisos/aviso-ia";
import { avisoEsperandoDeCookie, ESPERANDO_COOKIE } from "@/lib/esperando";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  const branding = await getBranding(session.organizationId);
  const authSession = await leerSesion(await headers());
  // 062 — Para el botón de sol y luna: salta a la pareja del tema actual.
  const { apariencia } = await aparienciaActual(session.organizationId);
  // El agente encendido y sin con qué pensar se ve desde fuera igual que un
  // bot roto. Se resuelve en el servidor y en el layout para que se vea desde
  // CUALQUIER pantalla, no solo desde el panel de un contacto (#85).
  const aviso = await avisoIaDe(session.organizationId);
  // 077 — Qué ve esta persona de «Esperando» (cintillo, aviso, sonido) se
  // resuelve aquí para que el primer pintado ya lo sepa. Vive en su cookie,
  // como la apariencia; sin ella, lo de siempre: cintillo y aviso con sonido.
  const avisoEsperando = avisoEsperandoDeCookie((await cookies()).get(ESPERANDO_COOKIE)?.value);

  return (
    <AppShell
      branding={branding}
      userName={authSession?.user.name ?? "Usuario"}
      role={session.role}
      apariencia={apariencia}
      // Se resuelve aquí, en el servidor: el cliente no ve `SOURCE_COMMIT`.
      // Baja con su procedencia, para que la insignia no presente como
      // verificado un commit que no salió del build (#50).
      commit={resolveCommit()}
      // Qué módulos opcionales existen se decide en el servidor y baja por
      // prop, igual que los canales de la Bandeja. El nav es un componente de
      // cliente: no puede —ni debe— leer variables de entorno.
      agenda={agendaEnabled()}
      kicker={navKicker([...enabledChannels()])}
      aviso={<AvisoIaBanner aviso={aviso} />}
      esperando={{ userId: session.userId, ...avisoEsperando }}
    >
      {/* 073 — La sesión la renueva el navegador: ver `leerSesion`. */}
      <SessionKeepalive />
      {children}
    </AppShell>
  );
}
