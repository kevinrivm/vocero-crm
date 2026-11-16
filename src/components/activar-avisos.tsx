"use client";

import { useI18n } from "@/components/i18n-provider";

import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { cn } from "@/lib/utils";
import { permisoAvisos } from "./avisos-de-mensajes";

/**
 * 056 · D1 — La fila «Activar avisos» del menú. Solo aparece mientras el
 * navegador no ha decidido el permiso; concedido o negado, desaparece (volver
 * a pedirlo es cosa de los ajustes del navegador, que es quien lo guarda).
 */
export function BotonActivarAvisos({ className }: { className?: string }) {
  const { t: tr } = useI18n();
  const [permiso, setPermiso] = useState<ReturnType<typeof permisoAvisos>>("unsupported");
  useEffect(() => setPermiso(permisoAvisos()), []);
  if (permiso !== "default") return null;
  return (
    <button
      type="button"
      className={cn("w-full text-left", className)}
      onClick={async () => {
        try {
          setPermiso(await Notification.requestPermission());
        } catch {
          setPermiso(permisoAvisos());
        }
      }}
      title={tr("Avisos del sistema cuando llegue un mensaje y no estés mirando Vocero")}
    >
      <BellRing className="h-5 w-5 shrink-0 text-text-3" strokeWidth={1.8} aria-hidden />
      <span className="flex-1">{tr("Activar avisos")}</span>
    </button>
  );
}
