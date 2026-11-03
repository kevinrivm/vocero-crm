"use client";

import { AlertTriangle, Info, Radio } from "lucide-react";
import type { GlobalAnnouncement } from "@/server/superadmin/actions";
import { cn } from "@/lib/utils";

export function GlobalAnnouncementBanner({
  announcement,
}: {
  announcement: GlobalAnnouncement | null;
}) {
  if (!announcement || !announcement.isActive) return null;

  const isWarning = announcement.type === "warning";

  return (
    <aside
      aria-label="Aviso global del sistema"
      className={cn(
        "relative z-50 flex w-full items-center justify-center gap-2.5 px-4 py-2 text-center text-xs sm:text-sm font-medium transition-colors shadow-xs shrink-0",
        isWarning
          ? "bg-amber-500/15 dark:bg-amber-500/25 border-b border-amber-500/30 text-amber-900 dark:text-amber-200"
          : "bg-[#0F4C5C] border-b border-[#0F4C5C]/40 text-white"
      )}
    >
      {isWarning ? (
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      ) : (
        <Radio className="h-4 w-4 shrink-0 animate-pulse text-cyan-200" />
      )}
      <span className="font-bold tracking-tight">
        {isWarning ? "Alerta del Sistema:" : "Comunicado Global:"}
      </span>
      <span className="truncate max-w-4xl">{announcement.message}</span>
    </aside>
  );
}

