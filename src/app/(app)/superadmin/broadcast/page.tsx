import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { BroadcastClient } from "@/components/superadmin/broadcast-client";
import { getGlobalAnnouncements } from "@/server/superadmin/actions";

export const dynamic = "force-dynamic";

export default async function SuperAdminBroadcastPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (!session.isSuperAdmin) redirect("/inbox");

  const announcements = await getGlobalAnnouncements();

  return <BroadcastClient initialAnnouncements={announcements} />;
}

