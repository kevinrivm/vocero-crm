import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { canConfigure } from "@/lib/auth/roles";
import { getBrandingContext } from "@/server/branding";
import { AppearanceClient } from "@/components/tenant/appearance-client";

export const dynamic = "force-dynamic";

export default async function TenantAppearancePage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");

  if (!canConfigure(session.role, session.userRole)) {
    redirect("/inbox");
  }

  const ctx = await getBrandingContext(session.organizationId);

  return (
    <AppearanceClient
      initialData={{
        name: ctx.branding.name,
        logoUrl: ctx.branding.logoUrl || null,
        primaryColor: ctx.branding.primaryColor || null,
        sidebarColor: ctx.branding.sidebarColor || null,
      }}
    />
  );
}

