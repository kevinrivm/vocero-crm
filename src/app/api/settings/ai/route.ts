import { withAuth } from "@/lib/api";
import * as http from "@/server/http/settings-ai";

export const dynamic = "force-dynamic";

export const GET = withAuth(http.GET);
export const PUT = withAuth(http.PUT);
export const DELETE = withAuth(http.DELETE);
