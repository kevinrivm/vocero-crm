import { withApiKey } from "@/server/api-v1/handler";
import * as h from "@/server/http/agent-readiness";

export const dynamic = "force-dynamic";

export const GET = withApiKey("configure", h.GET);
