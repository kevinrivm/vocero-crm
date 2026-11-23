import { conSesion } from "@/server/http/compartido";
import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { CONNECTOR_ORDER } from "@/lib/agenda-connectors";
import { agendaDisabledResponse, agendaEnabled } from "@/server/agenda/flag";
import {
  CalendarSettingsError,
  getSettings,
  upsertSettings,
} from "@/server/agenda/settings";


/**
 * 015 — La configuración de la agenda del negocio.
 *
 * Una instancia sin configurar responde 200 con los defaults, no 404: la
 * agenda ya es usable el día que se enciende.
 *
 * Jamás devuelve credenciales de un conector — esas viven en su propio
 * endpoint y solo salen como últimos 4 dígitos.
 */
export const GET = conSesion(async (session) => {
  if (!agendaEnabled()) return agendaDisabledResponse();
  const settings = await getSettings(session.organizationId);
  return Response.json({ settings });
});

const intervalSchema = z.object({
  start: z.string(),
  end: z.string(),
});

const putSchema = z.object({
  weeklyHours: z.record(z.string(), z.array(intervalSchema)).optional(),
  slotMinutes: z.number().optional(),
  bufferMinutes: z.number().optional(),
  minNoticeHours: z.number().optional(),
  maxDaysAhead: z.number().optional(),
  timezone: z.string().optional(),
  // El catálogo manda: un conector que no existe se rechaza aquí, y el
  // servicio lo vuelve a comprobar por si el llamador no es esta ruta.
  connector: z
    .string()
    .refine((v) => (CONNECTOR_ORDER as readonly string[]).includes(v), {
      message: "Conector desconocido",
    })
    .optional(),
  meetingLink: z.string().nullish(),
});

/**
 * Guarda lo que se pueda salvar: los enteros fuera de rango se recortan y los
 * intervalos mal escritos se descartan, en vez de tumbar el horario entero por
 * una celda. Lo que sí se rechaza es lo que rompería el motor después: una
 * zona horaria que el runtime no conoce, o un conector inexistente.
 */
export const PUT = conSesion(async (session, req: Request) => {
  if (!agendaEnabled()) return agendaDisabledResponse();
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;

  try {
    const settings = await upsertSettings(session.organizationId, {
      ...body.data,
      // `undefined` = no lo tocaron; `null` = lo vaciaron a propósito.
      meetingLink:
        body.data.meetingLink === undefined ? undefined : body.data.meetingLink,
    });
    return Response.json({ settings });
  } catch (err) {
    if (err instanceof CalendarSettingsError) {
      return apiError(422, "invalid_body", err.message);
    }
    throw err;
  }
});
