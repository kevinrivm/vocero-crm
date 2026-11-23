import { withApiKey } from "@/server/api-v1/handler";
import * as h from "@/server/http/agent-profile";

export const dynamic = "force-dynamic";

export const GET = withApiKey("configure", h.GET);
export const PUT = withApiKey("configure", h.PUT);
