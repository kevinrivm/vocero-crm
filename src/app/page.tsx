import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * La raíz decide a dónde se entra:
 * - Sin sesión: al login.
 * - Súper Admin: al panel global /superadmin.
 * - Clientes y agentes: directo a la Bandeja /inbox sin bloqueo de onboarding.
 */
export default async function Home() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");

  // Si es Super Admin, redirigir siempre e incondicionalmente al panel global
  if (session.isSuperAdmin) {
    redirect("/superadmin");
  }

  redirect("/inbox");
}
