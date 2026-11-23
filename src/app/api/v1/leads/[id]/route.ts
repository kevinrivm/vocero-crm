import { withApiKey } from "@/server/api-v1/handler";
import * as h from "@/server/http/pipeline-lead";

export const dynamic = "force-dynamic";

export const PATCH = withApiKey("operate", h.PATCH);
