import { conSesion } from "@/server/http/compartido";
import { apiError, parseBody } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import { crearNota, listarNotas, NotaError, notaSchema } from "@/server/notas";


type Params = { params: Promise<{ id: string }> };

/** 050 — Las notas internas de la conversación, por hora. */
export const GET = conSesion(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  try {
    const quien = { ...session, configura: canConfigure(session.role) };
    return Response.json({ notas: await listarNotas(quien, id) });
  } catch (err) {
    if (err instanceof NotaError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});

/** Escribir una nota: cualquiera del equipo. No envía nada al cliente. */
export const POST = conSesion(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, notaSchema);
  if (!body.ok) return body.response;
  try {
    const quien = { ...session, configura: canConfigure(session.role) };
    return Response.json({ nota: await crearNota(quien, id, body.data.texto) }, { status: 201 });
  } catch (err) {
    if (err instanceof NotaError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
