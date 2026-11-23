import { withAuth } from "@/lib/api";
import * as http from "@/server/http/pipeline-stage";

export const dynamic = "force-dynamic";

export const PATCH = withAuth(http.PATCH);
export const DELETE = withAuth(http.DELETE);
