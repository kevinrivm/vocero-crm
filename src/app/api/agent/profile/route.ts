import { withAuth } from "@/lib/api";
import * as http from "@/server/http/agent-profile";

export const dynamic = "force-dynamic";

export const GET = withAuth(http.GET);
export const PUT = withAuth(http.PUT);
