import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { getContactsData } from "@/server/tenant/contact-actions";
import { ContactsDirectoryClient } from "@/components/tenant/contacts-directory-client";
import { getEffectiveRolePermissions } from "@/server/tenant/permissions-actions";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");

  const perms = await getEffectiveRolePermissions(session.organizationId, session.role);
  if (!perms.contacts && !session.isSuperAdmin && session.role !== "owner") {
    redirect("/inbox");
  }

  const contactsData = await getContactsData();

  return <ContactsDirectoryClient initialData={contactsData} />;
}
