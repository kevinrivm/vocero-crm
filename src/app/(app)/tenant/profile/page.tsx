import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { getUserProfile } from "@/server/tenant/profile-actions";
import { ProfileClient } from "@/components/tenant/profile-client";

export const dynamic = "force-dynamic";

export default async function TenantProfilePage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");

  const profile = await getUserProfile();

  return <ProfileClient profile={profile} />;
}

