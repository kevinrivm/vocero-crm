import { withApiKey } from "@/server/api-v1/handler";
import * as h from "@/server/http/kb";

export const dynamic = "force-dynamic";

export const GET = withApiKey("configure", h.GET);
export const POST = withApiKey("configure", h.POST);
