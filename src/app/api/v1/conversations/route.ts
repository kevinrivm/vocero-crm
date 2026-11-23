import { withApiKey } from "@/server/api-v1/handler";
import * as h from "@/server/http/conversations";

export const dynamic = "force-dynamic";

export const GET = withApiKey("read", h.GET);
