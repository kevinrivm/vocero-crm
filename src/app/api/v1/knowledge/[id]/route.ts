import { withApiKey } from "@/server/api-v1/handler";
import * as h from "@/server/http/kb-entry";

export const dynamic = "force-dynamic";

export const PATCH = withApiKey("configure", h.PATCH);
export const DELETE = withApiKey("configure", h.DELETE);
