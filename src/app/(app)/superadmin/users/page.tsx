import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { getAllGlobalUsers } from "@/server/superadmin/actions";
import { UsersClient } from "@/components/superadmin/users-client";

export const dynamic = "force-dynamic";

export default async function SuperAdminUsersPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (!session.isSuperAdmin) redirect("/inbox");

  const users = await getAllGlobalUsers();

  return <UsersClient initialUsers={users} />;
}

