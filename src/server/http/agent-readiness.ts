import { onboardingStatus } from "@/server/onboarding/status";
import { conSesion } from "./compartido";
import { origenPublico, pendientesConEnlaces } from "./enlaces";

/**
 * 069 — `GET /api/v1/agent/readiness`: el estado de la guía de inicio y, por
 * cada paso sin terminar, su explicación y los enlaces absolutos donde se
 * resuelve. La puerta (`configure`) la pone la ruta.
 */
export const GET = conSesion(async (session) => {
  const estado = await onboardingStatus(session.organizationId);
  return Response.json(
    { ...estado, pendientes: pendientesConEnlaces(estado.steps, origenPublico()) },
    { headers: { "Cache-Control": "no-store" } }
  );
});
