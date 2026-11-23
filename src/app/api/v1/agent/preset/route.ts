import { withApiKey } from "@/server/api-v1/handler";
import * as h from "@/server/http/agent-preset";

export const dynamic = "force-dynamic";

export const POST = withApiKey("configure", h.POST);
