import { withApiKey } from "@/server/api-v1/handler";
import * as h from "@/server/http/pipeline-stages";

export const dynamic = "force-dynamic";
// Crear, renombrar, ordenar y borrar etapas es configurar el embudo, no operarlo.

export const GET = withApiKey("read", h.GET);
export const POST = withApiKey("configure", h.POST);
