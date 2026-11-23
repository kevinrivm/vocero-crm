/**
 * 069 — Handler de `POST /api/v1/agent/simulate`: probar el agente sin
 * WhatsApp. La regla vive en `server/lab/simular.ts` (el camino del
 * Laboratorio); aquí solo se valida, se limita y se traduce el resultado a la
 * respuesta pública.
 */
import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";
import { GUIA_DEL_PAR } from "@/server/onboarding/guide";
import { MAX_HISTORIAL, MAX_TEXTO, MAX_TURNOS, simular } from "@/server/lab/simular";
import { conSesion } from "./compartido";

/**
 * Simulaciones por minuto y por NEGOCIO, no por llave: cada una gasta saldo
 * del proveedor de IA del negocio, y tres llaves no deberían triplicar el
 * gasto posible. Una tanda de escenarios de la guía cabe de sobra.
 */
export const SIMULACIONES_POR_MINUTO = 10;

/**
 * Una sola simulación a la vez por negocio: el cerebro conversa de verdad y
 * dos tandas encimadas se estorban (y duplican el gasto) sin que nadie lo vea.
 */
const enCurso = new Set<string>();

const texto = z.string().trim().min(1).max(MAX_TEXTO);
const cuerpo = z.object({
  turns: z.array(texto).min(1).max(MAX_TURNOS),
  history: z
    .array(z.object({ role: z.enum(["customer", "agent"]), text: texto }))
    .max(MAX_HISTORIAL)
    .default([]),
  contactName: z.string().trim().max(80).optional(),
});

export const POST = conSesion(async (session, req: Request) => {
  const body = await parseBody(req, cuerpo);
  if (!body.ok) return body.response;

  const limite = checkRateLimit(`api_v1_simulate:${session.organizationId}`, {
    windowMs: 60_000,
    max: SIMULACIONES_POR_MINUTO,
  });
  if (!limite.allowed) {
    const res = apiError(
      429,
      "rate_limited",
      `Máximo ${SIMULACIONES_POR_MINUTO} simulaciones por minuto por negocio; espera un minuto`
    );
    res.headers.set("Retry-After", "60");
    return res;
  }
  if (enCurso.has(session.organizationId)) {
    return apiError(409, "simulacion_en_curso", "Ya hay una simulación corriendo en este negocio; espera a que termine");
  }

  enCurso.add(session.organizationId);
  let r: Awaited<ReturnType<typeof simular>>;
  try {
    r = await simular({
      organizationId: session.organizationId,
      turns: body.data.turns,
      history: body.data.history,
      contactName: body.data.contactName,
    });
  } finally {
    enCurso.delete(session.organizationId);
  }

  if (!r.ok) {
    return Response.json(
      {
        error: {
          code: r.code,
          message: `${r.detalle} Se conecta en el despliegue con BRAIN_DISPATCH_URL y BOT_API_KEY.`,
          enlaces: [{ titulo: "Cómo conectar tu agente (Nea u otro)", url: GUIA_DEL_PAR }],
        },
      },
      { status: 409 }
    );
  }

  return Response.json({
    simulated: true,
    notice:
      "Simulación: no se envió ningún mensaje por WhatsApp y la conversación de prueba se borró al terminar; las citas son de prueba y no llegan a ningún calendario. Sí se gastó saldo del proveedor de IA del negocio.",
    turns: r.turns,
  });
});
