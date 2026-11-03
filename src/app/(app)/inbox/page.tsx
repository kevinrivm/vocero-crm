import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { getInboxData } from "@/server/tenant/inbox-actions";
import { TenantInboxClient } from "@/components/tenant/tenant-inbox-client";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");

  const initialData = await getInboxData();

  return <TenantInboxClient initialData={initialData} />;
}
