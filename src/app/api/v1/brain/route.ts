import { withApiKey } from "@/server/api-v1/handler";
import * as h from "@/server/http/agent-brain-status";

export const dynamic = "force-dynamic";
// Quién contesta. El cerebro se conecta en el despliegue (BRAIN_DISPATCH_URL): aquí solo se lee.

export const GET = withApiKey("configure", h.GET);
