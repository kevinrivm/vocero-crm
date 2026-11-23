import { withApiKey } from "@/server/api-v1/handler";
import * as h from "@/server/http/agent-simulate";

export const dynamic = "force-dynamic";
// Cada turno espera al cerebro real (hasta ~90 s por línea).
export const maxDuration = 300;

export const POST = withApiKey("configure", h.POST);
