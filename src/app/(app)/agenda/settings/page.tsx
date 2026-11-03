import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { isAgentOnly } from "@/lib/auth/roles";
import { MeetingConnectorsSection } from "@/components/tenant/meeting-connectors";

export const dynamic = "force-dynamic";

export default async function AgendaSettingsPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (isAgentOnly(session.role, session.userRole)) redirect("/inbox");

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div className="rounded-3xl border border-white/60 dark:border-white/10 bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl p-6 sm:p-8 shadow-xl">
        <MeetingConnectorsSection />
      </div>
    </div>
  );
}

