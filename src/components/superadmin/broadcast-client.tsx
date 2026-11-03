"use client";

import { useState } from "react";
import {
  AlertCircle,
  Info,
  Radio,
  Send,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createGlobalAnnouncement,
  deleteGlobalAnnouncement,
  toggleGlobalAnnouncement,
  type GlobalAnnouncement,
} from "@/server/superadmin/actions";

export function BroadcastClient({
  initialAnnouncements = [],
}: {
  initialAnnouncements?: GlobalAnnouncement[];
}) {
  const [announcements, setAnnouncements] =
    useState<GlobalAnnouncement[]>(initialAnnouncements);
  const [newMsg, setNewMsg] = useState("");
  const [newType, setNewType] = useState<"info" | "warning">("info");
  const [creatingAnnouncement, setCreatingAnnouncement] = useState(false);
  const [togglingAnnId, setTogglingAnnId] = useState<string | null>(null);

  async function handleCreateAnnouncement(e: React.FormEvent) {
    e.preventDefault();
    if (!newMsg.trim()) return;
    setCreatingAnnouncement(true);
    try {
      const created = await createGlobalAnnouncement({
        message: newMsg.trim(),
        type: newType,
        isActive: true, // Se activa de inmediato al transmitir
      });
      setAnnouncements((prev) => [created, ...prev]);
      setNewMsg("");
    } catch (err) {
      alert(
        err instanceof Error ? err.message : "Error al crear el anuncio global"
      );
    } finally {
      setCreatingAnnouncement(false);
    }
  }

  async function handleToggleAnnouncement(ann: GlobalAnnouncement) {
    setTogglingAnnId(ann.id);
    try {
      const res = await toggleGlobalAnnouncement(ann.id);
      setAnnouncements((prev) =>
        prev.map((a) => (a.id === ann.id ? { ...a, isActive: res.isActive } : a))
      );
    } catch (err) {
      alert(
        err instanceof Error
          ? err.message
          : "Error al cambiar el estado del anuncio"
      );
    } finally {
      setTogglingAnnId(null);
    }
  }

  async function handleDeleteAnnouncement(id: string) {
    if (!confirm("¿Deseas eliminar este anuncio definitivamente?")) return;
    try {
      await deleteGlobalAnnouncement(id);
      setAnnouncements((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al eliminar el anuncio");
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Encabezado de Transmisión */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#155E75]/15 text-[#155E75]">
            <Radio className="h-5 w-5 animate-pulse" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <span>Transmisión Global</span>
              <Badge
                variant="outline"
                className="text-[10px] font-bold border-[#155E75]/30 text-[#155E75]"
              >
                En Vivo
              </Badge>
            </h1>
            <p className="text-xs text-muted-foreground">
              Emite comunicados oficiales o alertas críticas a todos los usuarios y agentes de la plataforma.
            </p>
          </div>
        </div>
      </div>

      {/* Tarjeta Glassmorphic de Transmisión */}
      <Card className="rounded-3xl border border-white/40 dark:border-white/10 bg-white/60 dark:bg-slate-900/60 shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur-xl overflow-hidden">
        <CardHeader className="border-b bg-muted/20 pb-4">
          <CardTitle className="text-base font-semibold">Redactar Comunicado</CardTitle>
          <CardDescription className="text-xs">
            El mensaje aparecerá como un banner fijo a lo ancho de la pantalla superior de todo el sistema.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 space-y-6">
          {/* Formulario para redactar un nuevo anuncio */}
          <form
            onSubmit={(e) => void handleCreateAnnouncement(e)}
            className="flex flex-col gap-3 sm:flex-row sm:items-end rounded-2xl bg-white/40 dark:bg-slate-800/40 border border-white/40 dark:border-white/10 p-4"
          >
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="announcement-msg" className="text-xs font-semibold">
                Mensaje de Transmisión
              </Label>
              <Input
                id="announcement-msg"
                placeholder="Ej. Mantenimiento programado hoy a las 11:00 PM UTC. El servicio no se interrumpirá."
                value={newMsg}
                onChange={(e) => setNewMsg(e.target.value)}
                required
                className="h-10 rounded-xl bg-background"
              />
            </div>

            <div className="w-full sm:w-48 space-y-1.5">
              <Label htmlFor="announcement-type" className="text-xs font-semibold">
                Tipo de Aviso
              </Label>
              <select
                id="announcement-type"
                value={newType}
                onChange={(e) => setNewType(e.target.value as "info" | "warning")}
                className="w-full h-10 rounded-xl border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="info">Informativo (Azul Petróleo)</option>
                <option value="warning">Alerta / Urgente (Ámbar)</option>
              </select>
            </div>

            <Button
              type="submit"
              disabled={creatingAnnouncement || !newMsg.trim()}
              className="h-10 gap-2 shrink-0 rounded-xl bg-[#155E75] hover:bg-[#155E75]/90 text-white font-semibold shadow-sm"
            >
              <Send className="h-4 w-4" />
              <span>{creatingAnnouncement ? "Emitiendo…" : "Transmitir"}</span>
            </Button>
          </form>

          {/* Lista de Anuncios Emitidos */}
          <div className="overflow-x-auto rounded-2xl border border-border/60">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40 text-[11px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border/60">
                <tr>
                  <th className="px-5 py-3">Mensaje</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3 text-center">Estado / Emisión</th>
                  <th className="px-4 py-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {announcements.map((ann) => {
                  const isToggling = togglingAnnId === ann.id;
                  return (
                    <tr
                      key={ann.id}
                      className={`transition-colors hover:bg-white/40 dark:hover:bg-slate-800/40 ${
                        ann.isActive ? "bg-emerald-500/5 dark:bg-emerald-950/10" : ""
                      }`}
                    >
                      <td className="px-5 py-3.5 max-w-md">
                        <p className="font-medium text-foreground text-xs leading-relaxed">
                          {ann.message}
                        </p>
                      </td>
                      <td className="px-4 py-3.5">
                        {ann.type === "warning" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                            <AlertCircle className="h-3 w-3" />
                            Alerta
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#155E75]/15 border border-[#155E75]/30 px-2 py-0.5 text-[11px] font-semibold text-[#155E75] dark:text-cyan-400">
                            <Info className="h-3 w-3" />
                            Informativo
                          </span>
                        )}
                      </td>
                      <td suppressHydrationWarning className="px-4 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(ann.createdAt).toLocaleDateString("es-CO", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <div className="inline-flex items-center gap-2">
                          <Switch
                            checked={ann.isActive}
                            disabled={isToggling}
                            onCheckedChange={() => void handleToggleAnnouncement(ann)}
                            label={ann.isActive ? "Apagar anuncio" : "Activar transmisión"}
                            size="sm"
                          />
                          <span
                            className={`text-[11px] font-medium ${
                              ann.isActive
                                ? "text-emerald-600 dark:text-emerald-400 font-semibold"
                                : "text-muted-foreground"
                            }`}
                          >
                            {ann.isActive ? "Activo" : "Inactivo"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive rounded-lg"
                          onClick={() => void handleDeleteAnnouncement(ann.id)}
                          title="Eliminar anuncio"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}

                {announcements.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-8 text-center text-xs text-muted-foreground"
                    >
                      No hay transmisiones emitidas. Escribe un mensaje arriba para publicar un aviso a todos los usuarios.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

