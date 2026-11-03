"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Filter,
  Layers,
  MessageCircle,
  MessageSquare,
  Phone,
  Plus,
  Search,
  Tag,
  Tags,
  Trash2,
  User,
  UserCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn, formatPhone, initials } from "@/lib/utils";
import {
  createContact,
  deleteContact,
  type ContactsViewData,
  type TenantContact,
} from "@/server/tenant/contact-actions";

export function ContactsDirectoryClient({ initialData }: { initialData: ContactsViewData }) {
  const router = useRouter();
  const [contacts, setContacts] = useState<TenantContact[]>(initialData.contacts);
  const [stages] = useState(initialData.stages);
  const [tags] = useState(initialData.tags);
  const [agents] = useState(initialData.agents);
  const [isPending, startTransition] = useTransition();

  // Filtros de Búsqueda y Selección
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStage, setSelectedStage] = useState<string>("all");
  const [selectedTag, setSelectedTag] = useState<string>("all");

  // Modal Nuevo Contacto
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [stageId, setStageId] = useState<string>(stages[0]?.id || "");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [assignedAgentId, setAssignedAgentId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // Filtrado reactivo en cliente
  const filteredContacts = useMemo(() => {
    return contacts.filter((c) => {
      // 1. Filtro por texto (nombre o teléfono)
      const q = searchQuery.toLowerCase().trim();
      const matchText =
        !q ||
        c.name.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q)) ||
        c.waIdentity.includes(q);

      // 2. Filtro por etapa
      const matchStage = selectedStage === "all" || (c.stage && c.stage.id === selectedStage);

      // 3. Filtro por etiqueta
      const matchTag =
        selectedTag === "all" || c.tags.some((t) => t.id === selectedTag);

      return matchText && matchStage && matchTag;
    });
  }, [contacts, searchQuery, selectedStage, selectedTag]);

  // Alternar selección de etiqueta en el modal
  const toggleTagSelection = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  // Abrir Modal de Creación
  const handleOpenModal = () => {
    setName("");
    setPhone("");
    setStageId(stages[0]?.id || "");
    setSelectedTagIds([]);
    setAssignedAgentId(agents[0]?.id || "");
    setNotes("");
    setFormError(null);
    setIsModalOpen(true);
  };

  // Enviar Creación de Contacto
  const handleCreateContact = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    startTransition(async () => {
      const res = await createContact({
        name,
        phone,
        stageId: stageId || undefined,
        tagIds: selectedTagIds,
        assignedAgentId: assignedAgentId || undefined,
        notes: notes || undefined,
      });

      if (!res.success) {
        setFormError(res.error || "No se pudo registrar el contacto");
        return;
      }

      setIsModalOpen(false);
      router.refresh();
    });
  };

  // Eliminar Contacto
  const handleDeleteContact = (contactId: string, contactName: string) => {
    if (!confirm(`¿Eliminar al contacto "${contactName}" del directorio?`)) return;

    startTransition(async () => {
      const res = await deleteContact(contactId);
      if (!res.success) {
        alert(res.error || "Error al eliminar");
        return;
      }
      setContacts((prev) => prev.filter((c) => c.id !== contactId));
      router.refresh();
    });
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Encabezado y Acción Principal */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0F4C5C] to-[#155E75] text-white shadow-md ring-1 ring-white/20">
              <Users className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Base de Contactos
              </h1>
              <p className="text-sm text-muted-foreground">
                Directorio unificado de clientes, etapas comerciales y agentes asignados.
              </p>
            </div>
          </div>

          <Button
            type="button"
            onClick={handleOpenModal}
            className="rounded-2xl bg-[#0F4C5C] hover:bg-[#155E75] text-white font-semibold shadow-md transition-all active:scale-95"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            + Nuevo Contacto
          </Button>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* BARRA SUPERIOR DE BÚSQUEDA Y FILTROS CRM                      */}
        {/* ------------------------------------------------------------- */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 rounded-3xl border border-white/60 dark:border-white/10 bg-white/70 dark:bg-slate-900/70 p-4 shadow-xl backdrop-blur-xl">
          {/* Búsqueda por Nombre o Teléfono */}
          <div className="md:col-span-6 relative flex items-center">
            <Search className="absolute left-3.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              placeholder="Buscar por nombre o número telefónico..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-10 rounded-2xl border-slate-300/80 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 text-sm"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Selector de Etapa del Embudo */}
          <div className="md:col-span-3">
            <select
              value={selectedStage}
              onChange={(e) => setSelectedStage(e.target.value)}
              className="w-full h-10 rounded-2xl border border-slate-300/80 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 px-3 text-xs sm:text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-[#0F4C5C]"
            >
              <option value="all">Todas las Etapas ({stages.length})</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Selector de Etiquetas */}
          <div className="md:col-span-3">
            <select
              value={selectedTag}
              onChange={(e) => setSelectedTag(e.target.value)}
              className="w-full h-10 rounded-2xl border border-slate-300/80 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 px-3 text-xs sm:text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-[#0F4C5C]"
            >
              <option value="all">Todas las Etiquetas ({tags.length})</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* TABLA DE DIRECTORIO (GLASSMORPHYSIM)                          */}
        {/* ------------------------------------------------------------- */}
        <div className="overflow-hidden rounded-3xl border border-white/60 dark:border-white/10 bg-white/70 dark:bg-slate-900/70 shadow-2xl backdrop-blur-xl">
          {filteredContacts.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground space-y-3">
              <Users className="h-12 w-12 mx-auto text-slate-300 dark:text-slate-600" />
              <p className="text-base font-bold text-foreground">
                No se encontraron contactos
              </p>
              <p className="text-xs max-w-sm mx-auto">
                {searchQuery || selectedStage !== "all" || selectedTag !== "all"
                  ? "Prueba modificando tus términos de búsqueda o limpiando los filtros seleccionados."
                  : "Tu directorio está listo. Registra tu primer contacto o sincroniza mensajes desde WhatsApp."}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleOpenModal}
                className="rounded-xl border-[#0F4C5C] text-[#0F4C5C] hover:bg-[#0F4C5C]/10 text-xs"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Añadir Contacto Manual
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-foreground">
                <thead className="border-b border-border/60 bg-white/40 dark:bg-slate-800/40 text-xs uppercase font-semibold text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-6 py-4">
                      Nombre / Avatar
                    </th>
                    <th scope="col" className="px-6 py-4">
                      Teléfono (WhatsApp)
                    </th>
                    <th scope="col" className="px-6 py-4">
                      Etapa del Embudo
                    </th>
                    <th scope="col" className="px-6 py-4">
                      Etiquetas (Tags)
                    </th>
                    <th scope="col" className="px-6 py-4">
                      Agente Asignado
                    </th>
                    <th scope="col" className="px-6 py-4 text-right">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {filteredContacts.map((contact) => (
                    <tr
                      key={contact.id}
                      className="hover:bg-white/40 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      {/* Avatar y Nombre */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0F4C5C] to-[#155E75] text-white font-bold text-sm shadow-sm ring-1 ring-white/20">
                            {initials(contact.name)}
                          </span>
                          <div className="min-w-0">
                            <span className="block font-semibold text-foreground truncate">
                              {contact.name}
                            </span>
                            {contact.notes && (
                              <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                                {contact.notes}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Teléfono / WhatsApp */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                            <Phone className="h-3 w-3" />
                          </span>
                          <a
                            href={`https://wa.me/${contact.waIdentity}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-xs text-foreground font-medium hover:underline hover:text-emerald-600"
                          >
                            {contact.phone ? formatPhone(contact.phone) : contact.waIdentity}
                          </a>
                        </div>
                      </td>

                      {/* Etapa del Embudo con Color Dinámico */}
                      <td className="px-6 py-4">
                        {contact.stage ? (
                          <span
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-white shadow-sm ring-1 ring-white/20"
                            style={{ backgroundColor: contact.stage.color }}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-white" />
                            {contact.stage.name}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-muted-foreground border border-slate-200 dark:border-slate-700">
                            Sin etapa
                          </span>
                        )}
                      </td>

                      {/* Etiquetas (Tags) como Badges */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 flex-wrap max-w-xs">
                          {contact.tags.length > 0 ? (
                            contact.tags.map((t) => (
                              <span
                                key={t.id}
                                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-white shadow-sm"
                                style={{ backgroundColor: t.color }}
                              >
                                {t.name}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground italic">
                              Sin etiquetas
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Agente Asignado */}
                      <td className="px-6 py-4">
                        {contact.assignedAgent ? (
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-[10px]">
                              {initials(contact.assignedAgent.name)}
                            </span>
                            <span className="text-xs font-medium text-foreground truncate max-w-[120px]">
                              {contact.assignedAgent.name}
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <User className="h-3 w-3" />
                            Sin asignar
                          </span>
                        )}
                      </td>

                      {/* Acciones */}
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* Botón Ir a Bandeja */}
                          <Link href="/inbox">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 rounded-xl border-border/80 bg-white/50 dark:bg-slate-800/50 hover:bg-white px-2.5 text-xs font-semibold"
                              title="Abrir conversación en bandeja"
                            >
                              <MessageSquare className="h-3.5 w-3.5 mr-1" />
                              Mensaje
                            </Button>
                          </Link>

                          {/* Botón Eliminar */}
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            disabled={isPending}
                            onClick={() => handleDeleteContact(contact.id, contact.name)}
                            className="h-8 w-8 rounded-xl border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 hover:bg-rose-100"
                            title="Eliminar contacto"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ------------------------------------------------------------- */}
        {/* MODAL: REGISTRAR NUEVO CONTACTO                               */}
        {/* ------------------------------------------------------------- */}
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                <UserPlus className="h-5 w-5 text-[#0F4C5C]" />
                Registrar Nuevo Contacto
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-600 dark:text-slate-400">
                Añade a un cliente o prospecto comercial vinculándolo a una etapa del embudo.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreateContact} className="space-y-4 pt-2">
              {formError && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-50 p-3 text-xs text-rose-700 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Nombre */}
                <div className="space-y-1.5">
                  <Label htmlFor="c-name" className="text-xs font-semibold">
                    Nombre Completo *
                  </Label>
                  <Input
                    id="c-name"
                    required
                    placeholder="Ej. Sofía Martínez"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="rounded-xl border-slate-300 dark:border-slate-700 bg-white/70 dark:bg-slate-800/70"
                  />
                </div>

                {/* Teléfono */}
                <div className="space-y-1.5">
                  <Label htmlFor="c-phone" className="text-xs font-semibold">
                    Teléfono (WhatsApp) *
                  </Label>
                  <Input
                    id="c-phone"
                    required
                    placeholder="Ej. +573001234567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="rounded-xl font-mono text-sm border-slate-300 dark:border-slate-700 bg-white/70 dark:bg-slate-800/70"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Incluye el código de país (ej. 52, 57, 54, etc.)
                  </p>
                </div>
              </div>

              {/* Etapa Inicial del Embudo */}
              <div className="space-y-1.5">
                <Label htmlFor="c-stage" className="text-xs font-semibold">
                  Etapa Inicial en el Pipeline
                </Label>
                <select
                  id="c-stage"
                  value={stageId}
                  onChange={(e) => setStageId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white/70 dark:bg-slate-800/70 px-3 py-2 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-[#0F4C5C]"
                >
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Selección de Etiquetas (Tags) */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Etiquetas Aplicables</Label>
                {tags.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No hay etiquetas creadas. Puedes definirlas en la sección de Configuración CRM.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {tags.map((t) => {
                      const isSelected = selectedTagIds.includes(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => toggleTagSelection(t.id)}
                          className={cn(
                            "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all shadow-sm ring-2",
                            isSelected
                              ? "ring-slate-900 dark:ring-white scale-105 text-white"
                              : "ring-transparent opacity-60 hover:opacity-100 text-white"
                          )}
                          style={{ backgroundColor: t.color }}
                        >
                          {isSelected && <Check className="h-3 w-3" />}
                          {t.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Agente Responsable */}
              <div className="space-y-1.5">
                <Label htmlFor="c-agent" className="text-xs font-semibold">
                  Agente Responsable
                </Label>
                <select
                  id="c-agent"
                  value={assignedAgentId}
                  onChange={(e) => setAssignedAgentId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white/70 dark:bg-slate-800/70 px-3 py-2 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-[#0F4C5C]"
                >
                  <option value="">Sin asignar (Cualquier agente)</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.email})
                    </option>
                  ))}
                </select>
              </div>

              {/* Notas Adicionales */}
              <div className="space-y-1.5">
                <Label htmlFor="c-notes" className="text-xs font-semibold">
                  Notas / Observaciones
                </Label>
                <Input
                  id="c-notes"
                  placeholder="Detalles sobre intereses de compra, requerimientos..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="rounded-xl border-slate-300 dark:border-slate-700 bg-white/70 dark:bg-slate-800/70"
                />
              </div>

              <DialogFooter className="pt-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border-slate-300 text-slate-700"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isPending}
                  className="rounded-xl bg-[#0F4C5C] hover:bg-[#155E75] text-white font-semibold"
                >
                  {isPending ? "Guardando..." : "Guardar Contacto"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

