import { mockGuard } from "@/lib/dev-guard";
import { barrido } from "@/server/dispatch/red-de-seguridad";

export const dynamic = "force-dynamic";

/**
 * 075 — Corre UN barrido de la red de seguridad y devuelve qué hizo.
 *
 * Para que el self-test la conduzca sin esperar diez minutos reales:
 * `?esperaMs=0` cambia la espera desde la entrega y `?conversationId=` la
 * limita a una conversación, para no tocar lo que otros casos dejaron sin
 * contestar a propósito. Tras el gate de los mocks: 404 en producción.
 */
export async function POST(req: Request) {
  const off = mockGuard();
  if (off) return off;
  const url = new URL(req.url);
  const espera = Number(url.searchParams.get("esperaMs"));
  const resumen = await barrido({
    esperaMs:
      url.searchParams.has("esperaMs") && Number.isFinite(espera) ? Math.max(0, espera) : undefined,
    soloConversacion: url.searchParams.get("conversationId") ?? undefined,
  });
  return Response.json(resumen);
}
