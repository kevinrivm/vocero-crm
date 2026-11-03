import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { isAgentOnly } from "@/lib/auth/roles";
import { todayInTz } from "@/lib/time/slots";
import { getBranding } from "@/server/branding";
import { agendaEnabled } from "@/server/agenda/flag";
import { businessTimezone } from "@/server/analytics/period";
import { ResultsClient } from "@/components/results/results-client";

export const dynamic = "force-dynamic";

/**
 * 019 — Resultados. Siempre disponible: no depende de nada externo, así que no
 * lleva bandera (spec 019, D3).
 *
 * Moneda, zona y "hoy" se resuelven en el servidor y bajan como props: si los
 * pidiera el cliente, la pantalla pintaría un instante con la moneda o el día
 * equivocados, y los atajos del rango no coincidirían con los del servidor.
 */
export default async function ResultsPage() {
  // El layout ya manda al login sin sesión; esto es por si la página se
  // resuelve primero.
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (isAgentOnly(session.role, session.userRole)) redirect("/inbox");
  const [branding, timezone] = await Promise.all([
    getBranding(session.organizationId),
    businessTimezone(session.organizationId),
  ]);
  return (
    <ResultsClient
      currency={branding.currency}
      agenda={agendaEnabled()}
      today={todayInTz(new Date(), timezone)}
      timezone={timezone}
    />
  );
}
