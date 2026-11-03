"use client";

import { LogOut, ShieldAlert, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/client";

export function CuentaSuspendida({
  orgName,
  isSuperAdmin = false,
}: {
  orgName: string;
  isSuperAdmin?: boolean;
}) {
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-gradient-to-br from-slate-50 to-slate-200 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 text-foreground">
      <div className="w-full max-w-md rounded-3xl border border-white/40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-8 shadow-2xl text-center space-y-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <ShieldAlert className="h-8 w-8" />
        </div>

        <div className="space-y-2">
          <span className="inline-block rounded-full bg-destructive/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-destructive">
            Acceso Bloqueado
          </span>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            Cuenta Suspendida
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            El espacio de trabajo para la organización{" "}
            <span className="font-semibold text-foreground">"{orgName}"</span>{" "}
            ha sido desactivado por el administrador global de la plataforma Nexia.
          </p>
        </div>

        <div className="rounded-2xl border border-border/60 bg-muted/30 p-4 text-xs text-muted-foreground text-left space-y-1.5">
          <p className="font-semibold text-foreground">¿Qué significa esto?</p>
          <ul className="list-disc pl-4 space-y-1">
            <li>Las operaciones del CRM y bandejas de entrada están pausadas.</li>
            <li>No se pueden enviar ni recibir nuevos mensajes.</li>
            <li>Comunícate con soporte de Nexia para verificar el estado de tu cuenta.</li>
          </ul>
        </div>

        <div className="flex flex-col gap-2.5 pt-2">
          {isSuperAdmin && (
            <Link href="/superadmin" className="w-full">
              <Button className="w-full gap-2 bg-[#155E75] hover:bg-[#155E75]/90 text-white">
                <ArrowLeft className="h-4 w-4" />
                Ir al Panel de Súper Administrador
              </Button>
            </Link>
          )}

          <Button
            variant="outline"
            onClick={() => void handleSignOut()}
            className="w-full gap-2 text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </Button>
        </div>
      </div>
    </div>
  );
}

