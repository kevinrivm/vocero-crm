import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { isAgentOnly } from "@/lib/auth/roles";
import { WhatsappConnectionCenter } from "@/components/whatsapp-setup/whatsapp-connection-center";

export const dynamic = "force-dynamic";

export default async function WhatsappSetupPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (isAgentOnly(session.role, session.userRole)) redirect("/inbox");

  return <WhatsappConnectionCenter />;
}

