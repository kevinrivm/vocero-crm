import { withAuth } from "@/lib/api";
import * as http from "@/server/http/pipeline-lead";

export const dynamic = "force-dynamic";

export const PATCH = withAuth(http.PATCH);
