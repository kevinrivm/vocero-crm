import { withAuth } from "@/lib/api";
import * as http from "@/server/http/bookings";

export const dynamic = "force-dynamic";

export const GET = withAuth(http.GET);
export const POST = withAuth(http.POST);
