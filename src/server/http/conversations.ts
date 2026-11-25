import { apiError } from "@/lib/api";
import { estaEsperando, minutosDeEspera } from "@/lib/esperando";
import { conSesion } from "@/server/http/compartido";
import { listConversations } from "@/server/inbox/queries";
import { withPins } from "@/server/inbox/pins";

/**
 * `?filter=esperando` (077): solo las que esperan a una persona, de la que más
 * lleva a la que menos, con los minutos de espera al momento de responder. Es
 * la misma regla que la pestaña «Esperando» de la Bandeja.
 */
export const GET = conSesion(async (session, req: Request) => {
  const url = new URL(req.url);
  const sinceParam = url.searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : undefined;
  const filter = url.searchParams.get("filter");
  if (filter !== null && filter !== "esperando") {
    return apiError(422, "filtro_desconocido", "El único filtro es «esperando».");
  }
  const ahora = new Date();
  const todas = await listConversations(
    session.organizationId,
    since && !Number.isNaN(since.getTime()) ? since : undefined,
    ahora
  );
  const conversations =
    filter !== "esperando"
      ? todas
      : todas
          .filter((c) => estaEsperando(c, ahora.getTime()))
          .sort((a, b) => Date.parse(a.espera!.desde) - Date.parse(b.espera!.desde))
          .map((c) => ({ ...c, minutosEsperando: minutosDeEspera(c.espera!.desde, ahora.getTime()) }));
  // 070 — Los fijados son de una persona del equipo. La sesión de la API v1
  // (trae `capabilities`) no es una persona: su lista no los lleva.
  if ("capabilities" in session) return Response.json({ conversations });
  return Response.json({
    conversations: await withPins(conversations, session.organizationId, session.userId),
  });
});
