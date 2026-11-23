import { conSesion } from "@/server/http/compartido";
import { apiError } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import { guideFrom } from "@/server/onboarding/guide";
import { onboardingStatus } from "@/server/onboarding/status";


/**
 * Qué le falta a la instancia para que el agente conteste (issue #86): los
 * pasos verificados y la guía que sale de ellos. Para quien puede configurar,
 * igual que la pantalla. Ver `server/onboarding/`.
 */
export const GET = conSesion(async (session) => {
  if (!canConfigure(session.role)) {
    return apiError(403, "forbidden", "Solo el propietario configura la instancia");
  }
  const status = await onboardingStatus(session.organizationId);
  return Response.json(
    { ...status, guide: guideFrom(status) },
    { headers: { "Cache-Control": "no-store" } }
  );
});
