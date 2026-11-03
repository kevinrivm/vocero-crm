"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  Kanban,
  Layers,
  Palette,
  Plus,
  Sparkles,
  Tag,
  Tags,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { CRM_PRESET_COLORS } from "@/lib/crm-colors";
import {
  createStage,
  updateStageOrder,
  deleteStage,
  createTag,
  deleteTag,
  type CrmSettingsData,
  type CrmStage,
  type CrmTag,
} from "@/server/tenant/crm-actions";

export function CrmSettingsClient({ initialData }: { initialData: CrmSettingsData }) {
  const router = useRouter();
  const [stages, setStages] = useState<CrmStage[]>(initialData.stages);
  const [tags, setTags] = useState<CrmTag[]>(initialData.tags);
  const [isPending, startTransition] = useTransition();

  // Estado para nueva etapa
  const [stageName, setStageName] = useState("");
  const [stageColor, setStageColor] = useState<string>(CRM_PRESET_COLORS[0].hex);
  const [stageError, setStageError] = useState<string | null>(null);

  // Estado para nueva etiqueta
  const [tagName, setTagName] = useState("");
  const [tagColor, setTagColor] = useState<string>(CRM_PRESET_COLORS[1].hex);
  const [tagError, setTagError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // MANEJADORES DE ETAPAS (PIPELINES)
  // ---------------------------------------------------------------------------
  const handleCreateStage = (e: React.FormEvent) => {
    e.preventDefault();
    setStageError(null);

    startTransition(async () => {
      const res = await createStage({
        name: stageName,
        color: stageColor,
      });

      if (!res.success) {
        setStageError(res.error || "No se pudo agregar la etapa");
        return;
      }

      setStageName("");
      setStageColor(CRM_PRESET_COLORS[0].hex);
      router.refresh();
    });
  };

  const handleMoveStage = (stageId: string, direction: "up" | "down") => {
    const sorted = [...stages].sort((a, b) => a.position - b.position);
    const index = sorted.findIndex((s) => s.id === stageId);
    if (index === -1) return;

    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sorted.length) return;

    // Intercambiar posiciones
    const current = sorted[index];
    const target = sorted[targetIndex];
    if (!current || !target) return;

    const currentPos = current.position;
    const targetPos = target.position;

    current.position = targetPos;
    target.position = currentPos;

    setStages([...sorted].sort((a, b) => a.position - b.position));

    startTransition(async () => {
      await updateStageOrder([
        { id: current.id, position: current.position },
        { id: target.id, position: target.position },
      ]);
      router.refresh();
    });
  };

  const handleDeleteStage = (stageId: string) => {
    if (!confirm("¿Deseas eliminar esta etapa del embudo de ventas?")) return;

    startTransition(async () => {
      const res = await deleteStage(stageId);
      if (!res.success) {
        alert(res.error || "No se pudo eliminar la etapa");
        return;
      }
      setStages((prev) => prev.filter((s) => s.id !== stageId));
      router.refresh();
    });
  };

  // ---------------------------------------------------------------------------
  // MANEJADORES DE ETIQUETAS (TAGS)
  // ---------------------------------------------------------------------------
  const handleCreateTag = (e: React.FormEvent) => {
    e.preventDefault();
    setTagError(null);

    startTransition(async () => {
      const res = await createTag({
        name: tagName,
        color: tagColor,
      });

      if (!res.success) {
        setTagError(res.error || "No se pudo crear la etiqueta");
        return;
      }

      setTagName("");
      setTagColor(CRM_PRESET_COLORS[1].hex);
      router.refresh();
    });
  };

  const handleDeleteTag = (tagId: string) => {
    if (!confirm("¿Deseas eliminar esta etiqueta?")) return;

    startTransition(async () => {
      const res = await deleteTag(tagId);
      if (!res.success) {
        alert(res.error || "No se pudo eliminar la etiqueta");
        return;
      }
      setTags((prev) => prev.filter((t) => t.id !== tagId));
      router.refresh();
    });
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Cabecera Principal */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0F4C5C] to-[#155E75] text-white shadow-md ring-1 ring-white/20">
              <Kanban className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Configuración CRM
              </h1>
              <p className="text-sm text-muted-foreground">
                Personaliza las etapas de tu embudo comercial y las etiquetas de clientes para{" "}
                <strong className="text-foreground">{initialData.organizationName}</strong>.
              </p>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* SISTEMA DE PESTAÑAS (TABS)                                    */}
        {/* ------------------------------------------------------------- */}
        <Tabs defaultValue="stages" className="w-full">
          <TabsList className="mb-2">
            <TabsTrigger value="stages" className="flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Embudos de Venta (Pipelines)
            </TabsTrigger>
            <TabsTrigger value="tags" className="flex items-center gap-2">
              <Tags className="h-4 w-4" />
              Etiquetas (Tags)
            </TabsTrigger>
          </TabsList>

          {/* =========================================================== */}
          {/* PESTAÑA 1: EMBUDOS DE VENTA (PIPELINES / ETAPAS)            */}
          {/* =========================================================== */}
          <TabsContent value="stages" className="space-y-6">
            {/* Formulario de Creación de Etapa */}
            <div className="overflow-hidden rounded-3xl border border-white/60 dark:border-white/10 bg-white/70 dark:bg-slate-900/70 p-6 shadow-2xl backdrop-blur-xl">
              <div className="flex items-center gap-2 mb-4">
                <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-[#0F4C5C]/15 text-[#0F4C5C] dark:text-cyan-400">
                  <Plus className="h-4 w-4" />
                </span>
                <h2 className="text-lg font-bold text-foreground">Nueva Etapa de Venta</h2>
              </div>

              {stageError && (
                <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-50 p-3 text-xs text-rose-700">
                  {stageError}
                </div>
              )}

              <form
                onSubmit={handleCreateStage}
                className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end"
              >
                <div className="md:col-span-6 space-y-1.5">
                  <Label htmlFor="stage-name" className="text-xs font-semibold">
                    Nombre de la Etapa
                  </Label>
                  <Input
                    id="stage-name"
                    required
                    placeholder="Ej. Contacto Inicial, En Negociación..."
                    value={stageName}
                    onChange={(e) => setStageName(e.target.value)}
                    className="rounded-xl border-slate-300 dark:border-slate-700 bg-white/70 dark:bg-slate-800/70"
                  />
                </div>

                {/* Selector de Color */}
                <div className="md:col-span-4 space-y-1.5">
                  <Label className="text-xs font-semibold">Color Distintivo</Label>
                  <div className="flex items-center gap-2 flex-wrap pt-1">
                    {CRM_PRESET_COLORS.map((c) => (
                      <button
                        key={c.hex}
                        type="button"
                        onClick={() => setStageColor(c.hex)}
                        title={c.name}
                        className={cn(
                          "h-7 w-7 rounded-full flex items-center justify-center transition-all shadow-sm ring-2",
                          stageColor === c.hex ? "ring-slate-900 dark:ring-white scale-110" : "ring-transparent hover:scale-105"
                        )}
                        style={{ backgroundColor: c.hex }}
                      >
                        {stageColor === c.hex && <Check className="h-3.5 w-3.5 text-white" />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="md:col-span-2">
                  <Button
                    type="submit"
                    disabled={isPending}
                    className="w-full rounded-xl bg-[#0F4C5C] hover:bg-[#155E75] text-white font-semibold text-xs py-2.5 shadow-md active:scale-95"
                  >
                    <Plus className="h-4 w-4 mr-1.5" />
                    {isPending ? "Añadiendo..." : "Añadir Etapa"}
                  </Button>
                </div>
              </form>
            </div>

            {/* Lista Interactiva de Etapas */}
            <div className="overflow-hidden rounded-3xl border border-white/60 dark:border-white/10 bg-white/70 dark:bg-slate-900/70 shadow-2xl backdrop-blur-xl">
              <div className="p-4 sm:p-5 border-b border-border/50 bg-white/40 dark:bg-slate-800/40 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                    Etapas Actuales del Pipeline ({stages.length})
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Utiliza las flechas para reorganizar el flujo de tus tratos comerciales.
                  </p>
                </div>
              </div>

              <div className="divide-y divide-border/40">
                {stages.map((stage, idx) => (
                  <div
                    key={stage.id}
                    className="flex items-center justify-between gap-4 p-4 hover:bg-white/40 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                        {idx + 1}
                      </span>

                      {/* Indicador visual de color */}
                      <span
                        className="h-3.5 w-3.5 rounded-full shrink-0 shadow-sm ring-2 ring-white/50"
                        style={{ backgroundColor: stage.color }}
                      />

                      <div className="min-w-0">
                        <p className="font-semibold text-foreground text-sm truncate">
                          {stage.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {stage.kind === "won"
                            ? "Etapa ancla de Ganado"
                            : stage.kind === "lost"
                            ? "Etapa ancla de Perdido"
                            : "Etapa de negociación abierta"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Botón Mover Arriba */}
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        disabled={idx === 0 || isPending}
                        onClick={() => handleMoveStage(stage.id, "up")}
                        className="h-8 w-8 rounded-xl border-border/60 bg-white/60 dark:bg-slate-800/60"
                        title="Mover Arriba"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>

                      {/* Botón Mover Abajo */}
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        disabled={idx === stages.length - 1 || isPending}
                        onClick={() => handleMoveStage(stage.id, "down")}
                        className="h-8 w-8 rounded-xl border-border/60 bg-white/60 dark:bg-slate-800/60"
                        title="Mover Abajo"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>

                      {/* Botón Eliminar */}
                      {stage.kind === "open" ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          disabled={isPending}
                          onClick={() => handleDeleteStage(stage.id)}
                          className="h-8 w-8 rounded-xl border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 hover:bg-rose-100"
                          title="Eliminar Etapa"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <span className="text-[10px] uppercase font-semibold text-muted-foreground px-2">
                          Fija
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* =========================================================== */}
          {/* PESTAÑA 2: ETIQUETAS (TAGS)                                 */}
          {/* =========================================================== */}
          <TabsContent value="tags" className="space-y-6">
            {/* Formulario de Creación de Etiqueta */}
            <div className="overflow-hidden rounded-3xl border border-white/60 dark:border-white/10 bg-white/70 dark:bg-slate-900/70 p-6 shadow-2xl backdrop-blur-xl">
              <div className="flex items-center gap-2 mb-4">
                <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-[#0F4C5C]/15 text-[#0F4C5C] dark:text-cyan-400">
                  <Tag className="h-4 w-4" />
                </span>
                <h2 className="text-lg font-bold text-foreground">Crear Nueva Etiqueta</h2>
              </div>

              {tagError && (
                <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-50 p-3 text-xs text-rose-700">
                  {tagError}
                </div>
              )}

              <form
                onSubmit={handleCreateTag}
                className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end"
              >
                <div className="md:col-span-6 space-y-1.5">
                  <Label htmlFor="tag-name" className="text-xs font-semibold">
                    Nombre de la Etiqueta
                  </Label>
                  <Input
                    id="tag-name"
                    required
                    placeholder="Ej. Cliente VIP, Mayorista, Queja, Cotización..."
                    value={tagName}
                    onChange={(e) => setTagName(e.target.value)}
                    className="rounded-xl border-slate-300 dark:border-slate-700 bg-white/70 dark:bg-slate-800/70"
                  />
                </div>

                {/* Selector de Color */}
                <div className="md:col-span-4 space-y-1.5">
                  <Label className="text-xs font-semibold">Color de la Insignia</Label>
                  <div className="flex items-center gap-2 flex-wrap pt-1">
                    {CRM_PRESET_COLORS.map((c) => (
                      <button
                        key={c.hex}
                        type="button"
                        onClick={() => setTagColor(c.hex)}
                        title={c.name}
                        className={cn(
                          "h-7 w-7 rounded-full flex items-center justify-center transition-all shadow-sm ring-2",
                          tagColor === c.hex ? "ring-slate-900 dark:ring-white scale-110" : "ring-transparent hover:scale-105"
                        )}
                        style={{ backgroundColor: c.hex }}
                      >
                        {tagColor === c.hex && <Check className="h-3.5 w-3.5 text-white" />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="md:col-span-2">
                  <Button
                    type="submit"
                    disabled={isPending}
                    className="w-full rounded-xl bg-[#0F4C5C] hover:bg-[#155E75] text-white font-semibold text-xs py-2.5 shadow-md active:scale-95"
                  >
                    <Plus className="h-4 w-4 mr-1.5" />
                    {isPending ? "Guardando..." : "Crear Etiqueta"}
                  </Button>
                </div>
              </form>
            </div>

            {/* Tabla de Etiquetas Existentes */}
            <div className="overflow-hidden rounded-3xl border border-white/60 dark:border-white/10 bg-white/70 dark:bg-slate-900/70 shadow-2xl backdrop-blur-xl">
              <div className="p-4 sm:p-5 border-b border-border/50 bg-white/40 dark:bg-slate-800/40">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  Catálogo de Etiquetas ({tags.length})
                </h3>
              </div>

              {tags.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  <Tag className="h-10 w-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                  <p className="font-semibold text-foreground">No tienes etiquetas registradas</p>
                  <p className="text-xs mt-1">
                    Crea etiquetas arriba para clasificar a tus contactos y prospectos de WhatsApp.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-foreground">
                    <thead className="border-b border-border/50 bg-white/30 dark:bg-slate-800/30 text-xs uppercase font-semibold text-muted-foreground">
                      <tr>
                        <th scope="col" className="px-6 py-3.5">
                          Insignia / Nombre
                        </th>
                        <th scope="col" className="px-6 py-3.5">
                          Fecha de Creación
                        </th>
                        <th scope="col" className="px-6 py-3.5 text-right">
                          Acción
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {tags.map((tag) => (
                        <tr
                          key={tag.id}
                          className="hover:bg-white/40 dark:hover:bg-slate-800/30 transition-colors"
                        >
                          <td className="px-6 py-4">
                            <span
                              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold text-white shadow-sm ring-1 ring-white/30"
                              style={{ backgroundColor: tag.color }}
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                              {tag.name}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-xs text-muted-foreground">
                            {new Date(tag.createdAt).toLocaleDateString("es-ES", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={isPending}
                              onClick={() => handleDeleteTag(tag.id)}
                              className="h-8 rounded-xl border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 hover:bg-rose-100 px-2.5 text-xs font-semibold"
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-1" />
                              Eliminar
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

