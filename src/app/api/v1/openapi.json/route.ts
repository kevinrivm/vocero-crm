import { contratoPara, origenPublico } from "@/server/api-v1/docs";
import { apiV1DisabledResponse, apiV1Enabled } from "@/server/api-v1/flag";

export const dynamic = "force-dynamic";

/**
 * El OpenAPI de la v1, sin llave: lo importan Postman, n8n o un agente antes de
 * tener una. Con la API apagada es un 404, como el resto de la API.
 */
export async function GET() {
  if (!apiV1Enabled()) return apiV1DisabledResponse();
  return Response.json(contratoPara(origenPublico()), { headers: { "Cache-Control": "no-store" } });
}
