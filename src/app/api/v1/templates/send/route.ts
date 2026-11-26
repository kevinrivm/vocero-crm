import { withApiKey } from "@/server/api-v1/handler";
import * as h from "@/server/http/templates-send";

export const dynamic = "force-dynamic";

export const POST = withApiKey("send", h.POST);
