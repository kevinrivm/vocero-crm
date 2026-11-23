import { withApiKey } from "@/server/api-v1/handler";
import * as h from "@/server/http/settings-ai";

export const dynamic = "force-dynamic";
// La llave se guarda pero nunca se lee: la respuesta trae el estado y los últimos 4. Sin DELETE por la API.

export const GET = withApiKey("configure", h.GET);
export const PUT = withApiKey("configure", h.PUT);
