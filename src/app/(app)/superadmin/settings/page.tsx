import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { Settings, Shield, Server, Database, Key, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function SuperAdminSettingsPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (!session.isSuperAdmin) redirect("/inbox");

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Encabezado */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#155E75]/15 text-[#155E75]">
            <Settings className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <span>Ajustes Globales</span>
              <Badge variant="outline" className="text-[10px] font-bold border-[#155E75]/30 text-[#155E75]">
                Plataforma
              </Badge>
            </h1>
            <p className="text-xs text-muted-foreground">
              Configuraciones maestras de seguridad, gobernanza de datos y parámetros del entorno de producción.
            </p>
          </div>
        </div>
      </div>

      {/* Grid de Secciones de Configuración */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Tarjeta 1: Gobernanza y Registro */}
        <Card className="rounded-3xl border border-white/40 dark:border-white/10 bg-white/60 dark:bg-slate-900/60 shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur-xl">
          <CardHeader className="border-b bg-muted/20 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#155E75]/15 text-[#155E75]">
                <Shield className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">Gobernanza y Acceso</CardTitle>
                <CardDescription className="text-xs">Políticas de registro de nuevas empresas</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between p-3 rounded-2xl bg-white/40 dark:bg-slate-800/40 border border-white/30 dark:border-white/10">
              <div>
                <p className="font-semibold text-foreground">Registro Público</p>
                <p className="text-muted-foreground">Cerrado tras la primera organización (creación solo por Súper Admin)</p>
              </div>
              <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                Protegido
              </Badge>
            </div>

            <div className="flex items-center justify-between p-3 rounded-2xl bg-white/40 dark:bg-slate-800/40 border border-white/30 dark:border-white/10">
              <div>
                <p className="font-semibold text-foreground">Aislamiento de Dominio</p>
                <p className="text-muted-foreground">Consultas forzadas por <code>organization_id</code> y helper <code>scoped()</code></p>
              </div>
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
          </CardContent>
        </Card>

        {/* Tarjeta 2: Almacenamiento e Infraestructura */}
        <Card className="rounded-3xl border border-white/40 dark:border-white/10 bg-white/60 dark:bg-slate-900/60 shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur-xl">
          <CardHeader className="border-b bg-muted/20 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#155E75]/15 text-[#155E75]">
                <Database className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">Persistencia y Retención</CardTitle>
                <CardDescription className="text-xs">Bases de datos, media y depuración</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between p-3 rounded-2xl bg-white/40 dark:bg-slate-800/40 border border-white/30 dark:border-white/10">
              <div>
                <p className="font-semibold text-foreground">Motor de Base de Datos</p>
                <p className="text-muted-foreground">PostgreSQL 16 · Conexión fija en TimeZone UTC</p>
              </div>
              <Badge variant="outline" className="text-[10px] border-[#155E75]/30 text-[#155E75]">
                Activo
              </Badge>
            </div>

            <div className="flex items-center justify-between p-3 rounded-2xl bg-white/40 dark:bg-slate-800/40 border border-white/30 dark:border-white/10">
              <div>
                <p className="font-semibold text-foreground">Retención de Webhooks</p>
                <p className="text-muted-foreground">7 días para eventos procesados · 30 días para fallidos</p>
              </div>
              <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-600">
                Automático
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Tarjeta 3: Criptografía y Seguridad */}
        <Card className="rounded-3xl border border-white/40 dark:border-white/10 bg-white/60 dark:bg-slate-900/60 shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur-xl md:col-span-2">
          <CardHeader className="border-b bg-muted/20 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#155E75]/15 text-[#155E75]">
                <Key className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">Cifrado de Secretos en Reposo</CardTitle>
                <CardDescription className="text-xs">Algoritmo AES-256-GCM para tokens de WhatsApp e IA</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-5 text-xs text-muted-foreground space-y-2">
            <p className="leading-relaxed">
              Todos los tokens de acceso a la Graph API de Meta y llaves de proveedores de modelos se encuentran cifrados
              mediante claves de 256 bits y vectores de inicialización (IV) de uso único. Los secretos nunca son expuestos
              en logs ni enviados al cliente, mostrando únicamente sus últimos 4 caracteres.
            </p>
            <div className="flex items-center gap-2 pt-2 text-[11px] font-mono text-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              <span>Estándar de seguridad criptográfica activo y verificado.</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

