import { conSesion } from "@/server/http/compartido";
import { dayIsoInTz, timeInTz, dayLabelInTz } from "@/lib/time/slots";
import { agendaDisabledResponse, agendaEnabled } from "@/server/agenda/flag";
import { computeAvailability } from "@/server/agenda/availability";
import { getSettings } from "@/server/agenda/settings";


const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 015 — Los huecos libres, para el operador.
 *
 * A diferencia de la superficie del bot, esta NO registra oferta: es la vista
 * de quien ya está mirando la agenda y elige de lo que ve.
 *
 * Sin huecos responde `{"slots":[]}` con 200: agenda llena es una respuesta,
 * no un error.
 */
export const GET = conSesion(async (session, req: Request) => {
  if (!agendaEnabled()) return agendaDisabledResponse();

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const settings = await getSettings(session.organizationId);
  const now = new Date();
  const slots = await computeAvailability(session.organizationId, {
    fromISO: from && ISO_DATE.test(from) ? from : undefined,
    toISO: to && ISO_DATE.test(to) ? to : undefined,
    settings,
    now,
  });

  return Response.json({
    slots: slots.map((s) => ({
      ...s,
      dayIso: dayIsoInTz(new Date(s.startUtc), settings.timezone),
      dayLabel: dayLabelInTz(s.startUtc, settings.timezone, now),
      time: timeInTz(s.startUtc, settings.timezone),
    })),
  });
});
