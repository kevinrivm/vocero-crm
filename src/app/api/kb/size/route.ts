import { withAuth } from "@/lib/api";
import * as http from "@/server/http/kb-size";

export const dynamic = "force-dynamic";

export const GET = withAuth(http.GET);
