"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  ChevronLeft,
  ChevronRight,
  Kanban,
  MessageSquareText,
  Phone,
  Plus,
  Settings2,
  Trophy,
  Users,
  XCircle,
} from "lucide-react";
import type { LossReason, PriorityValue, StageDto } from "@/lib/types";
import { formatMoneyCents, sumable } from "@/lib/money";
import { cn, formatPhone } from "@/lib/utils";
import { ContactAvatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/components/inbox/helpers";
import { StageManager } from "./stage-manager";
import { LossReasonDialog } from "./loss-reason-dialog";
import { AmountDialog } from "./amount-dialog";
import { PriorityBadge } from "./priority-picker";
import { LeadDrawer } from "./lead-drawer";

export type BoardLead = {
  id: string;
  stageId: string;
  position: number;
  lastActivityAt: string | null;
  contact: { id: string; name: string; phone: string | null };
  conversationId: string | null;
  amountCents: number | null;
  currency: string | null;
  priority: PriorityValue | null;
};

export function PipelineClient() {
  const [stages, setStages] = useState<StageDto[]>([]);
  const [currency, setCurrency] = useState("MXN");
  const [leads, setLeads] = useState<BoardLead[]>([]);
  const [activeLead, setActiveLead] = useState<BoardLead | null>(null);
  const [managing, setManaging] = useState(false);
  const [cargando, setCargando] = useState(true);

  /** Arrastre hacia una etapa perdida, esperando el motivo. */
  const [pendingLoss, setPendingLoss] = useState<{
    leadId: string;
    stageId: string;
    name: string;
  } | null>(null);

  /** Tarjeta cuyo monto se está capturando. */
  const [editandoMonto, setEditandoMonto] = useState<BoardLead | null>(null);

  /** Trato abierto en el cajón lateral. */
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const abierto = leads.find((l) => l.id === abiertoId) ?? null;

  const sortedStages = useMemo(
    () => [...stages].sort((a, b) => a.position - b.position),
    [stages]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const refetch = useCallback(async () => {
    const res = await fetch("/api/pipeline/board").catch(() => null);
    if (!res?.ok) {
      setCargando(false);
      return;
    }
    const data = (await res.json()) as {
      stages: StageDto[];
      leads: BoardLead[];
      currency?: string;
    };
    if (data.currency) setCurrency(data.currency);
    setStages(data.stages);
    setLeads(data.leads);
    setCargando(false);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  function onDragStart(event: DragStartEvent) {
    const lead = leads.find((l) => l.id === event.active.id);
    setActiveLead(lead ?? null);
  }

  async function moverLead(
    leadId: string,
    overStage: string,
    loss?: { reason: LossReason; note: string }
  ) {
    const position = leads.filter((l) => l.stageId === overStage).length;
    // Optimista + persistencia
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, stageId: overStage, position } : l))
    );
    await fetch(`/api/pipeline/leads/${leadId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        stageId: overStage,
        position,
        ...(loss
          ? { lossReason: loss.reason, ...(loss.note ? { lossNote: loss.note } : {}) }
          : {}),
      }),
    }).catch(() => null);
    void refetch();
  }

  function deslizarLead(lead: BoardLead, direction: "prev" | "next") {
    const currentIndex = sortedStages.findIndex((s) => s.id === lead.stageId);
    if (currentIndex === -1) return;

    const targetIndex = direction === "next" ? currentIndex + 1 : currentIndex - 1;
    if (targetIndex < 0 || targetIndex >= sortedStages.length) return;

    const targetStage = sortedStages[targetIndex];
    if (!targetStage) return;

    if (targetStage.kind === "lost") {
      setPendingLoss({ leadId: lead.id, stageId: targetStage.id, name: lead.contact.name });
      return;
    }

    void moverLead(lead.id, targetStage.id);
  }

  async function guardarMonto(leadId: string, cents: number | null) {
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, amountCents: cents } : l))
    );
    await fetch(`/api/pipeline/leads/${leadId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amountCents: cents }),
    }).catch(() => null);
    void refetch();
  }

  async function guardarPrioridad(leadId: string, priority: PriorityValue | null) {
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, priority } : l))
    );
    await fetch(`/api/pipeline/leads/${leadId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ priority }),
    }).catch(() => null);
    void refetch();
  }

  async function onDragEnd(event: DragEndEvent) {
    setActiveLead(null);
    const leadId = String(event.active.id);
    const overStage = event.over ? String(event.over.id) : null;
    if (!overStage) return;
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.stageId === overStage) return;

    const destino = stages.find((s) => s.id === overStage);
    if (destino?.kind === "lost") {
      setPendingLoss({ leadId, stageId: overStage, name: lead.contact.name });
      return;
    }

    await moverLead(leadId, overStage);
  }

  function moverDesdeCajon(leadId: string, stageId: string) {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.stageId === stageId) return;
    const destino = stages.find((s) => s.id === stageId);
    if (destino?.kind === "lost") {
      setPendingLoss({ leadId, stageId, name: lead.contact.name });
      return;
    }
    void moverLead(leadId, stageId);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Cabecera con estética Glassmorphism */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/40 dark:border-white/10 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md px-4 py-3.5 sm:px-6 sm:py-4 shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-sm">
            <Kanban className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[17px] font-bold tracking-tight text-foreground">
                Pipeline de Contactos
              </h2>
              <span className="rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[11px] font-semibold text-primary">
                {leads.length} {leads.length === 1 ? "contacto" : "contactos"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Arrastra o desliza manualmente las tarjetas para mover tus prospectos entre etapas comerciales.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setManaging(true)}
            className="rounded-xl border-white/50 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm shadow-sm hover:bg-white/80 dark:hover:bg-slate-700/80 font-medium text-xs"
          >
            <Settings2 className="h-3.5 w-3.5 mr-1.5" /> Gestionar etapas
          </Button>
        </div>
      </header>

      {/* Tablero Kanban con scroll horizontal suave */}
      <div className="flex-1 snap-x snap-mandatory overflow-x-auto p-3 sm:snap-none sm:p-5">
        {cargando ? (
          <div className="flex h-64 w-full items-center justify-center text-sm text-muted-foreground">
            Cargando tablero...
          </div>
        ) : sortedStages.length === 0 ? (
          <div className="flex h-64 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-6 text-center text-muted-foreground">
            <Kanban className="h-8 w-8 text-muted-foreground/60" />
            <p className="text-sm font-medium">No hay etapas configuradas en el pipeline.</p>
            <Button size="sm" variant="outline" onClick={() => setManaging(true)}>
              Crear primera etapa
            </Button>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            onDragStart={onDragStart}
            onDragEnd={(e) => void onDragEnd(e)}
          >
            <div className="flex h-full gap-4 items-start pb-2">
              {sortedStages.map((stage, stageIndex) => (
                <StageColumn
                  key={stage.id}
                  stage={stage}
                  stageIndex={stageIndex}
                  totalStages={sortedStages.length}
                  currency={currency}
                  onEditAmount={setEditandoMonto}
                  onOpen={(l) => setAbiertoId(l.id)}
                  onSlide={deslizarLead}
                  leads={leads
                    .filter((l) => l.stageId === stage.id)
                    .sort((a, b) => a.position - b.position)}
                />
              ))}
            </div>
            <DragOverlay>
              {activeLead ? (
                <LeadCard lead={activeLead} currency={currency} overlay />
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {managing && (
        <StageManager
          stages={stages}
          onClose={() => setManaging(false)}
          onChanged={() => void refetch()}
        />
      )}

      {abierto && (
        <LeadDrawer
          lead={abierto}
          stages={stages}
          currency={currency}
          onClose={() => setAbiertoId(null)}
          onMoveStage={(stageId) => moverDesdeCajon(abierto.id, stageId)}
          onAmount={(cents) => void guardarMonto(abierto.id, cents)}
          onPriority={(p) => void guardarPrioridad(abierto.id, p)}
        />
      )}

      {editandoMonto && (
        <AmountDialog
          leadName={editandoMonto.contact.name}
          currency={editandoMonto.currency ?? currency}
          amountCents={editandoMonto.amountCents}
          priority={editandoMonto.priority}
          onPriorityChange={(p) => {
            setEditandoMonto({ ...editandoMonto, priority: p });
            void guardarPrioridad(editandoMonto.id, p);
          }}
          onCancel={() => setEditandoMonto(null)}
          onSave={(cents) => {
            const leadId = editandoMonto.id;
            setEditandoMonto(null);
            void guardarMonto(leadId, cents);
          }}
        />
      )}

      {pendingLoss && (
        <LossReasonDialog
          leadName={pendingLoss.name}
          onCancel={() => setPendingLoss(null)}
          onConfirm={(reason, note) => {
            const { leadId, stageId } = pendingLoss;
            setPendingLoss(null);
            void moverLead(leadId, stageId, { reason, note });
          }}
        />
      )}
    </div>
  );
}

/** Totales y sumatoria financiera de una columna. */
function totalesDeEtapa(leads: BoardLead[], businessCurrency: string) {
  let totalCents = 0;
  let sinMonto = 0;
  let otraMoneda = 0;

  for (const l of leads) {
    if (l.amountCents === null) {
      sinMonto++;
      continue;
    }
    if (!sumable({ amountCents: l.amountCents, currency: l.currency }, businessCurrency)) {
      otraMoneda++;
      continue;
    }
    totalCents += l.amountCents;
  }
  return { totalCents, sinMonto, otraMoneda };
}

function StageColumn({
  stage,
  stageIndex,
  totalStages,
  leads,
  currency,
  onEditAmount,
  onOpen,
  onSlide,
}: {
  stage: StageDto;
  stageIndex: number;
  totalStages: number;
  leads: BoardLead[];
  currency: string;
  onEditAmount: (lead: BoardLead) => void;
  onOpen: (lead: BoardLead) => void;
  onSlide: (lead: BoardLead, direction: "prev" | "next") => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex h-full w-72 md:w-80 shrink-0 snap-start flex-col rounded-2xl border border-white/50 dark:border-white/10 bg-white/45 dark:bg-slate-900/45 backdrop-blur-md shadow-sm transition-all duration-200",
        isOver && "border-primary/60 ring-2 ring-primary/20 bg-primary/[0.04]"
      )}
    >
      {/* Cabecera de la columna */}
      <div className="flex items-center justify-between px-3.5 py-3 border-b border-white/40 dark:border-white/10">
        <div className="flex items-center gap-2 min-w-0">
          {stage.kind === "won" && (
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Trophy className="h-3.5 w-3.5" />
            </span>
          )}
          {stage.kind === "lost" && (
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 text-rose-500">
              <XCircle className="h-3.5 w-3.5" />
            </span>
          )}
          {stage.kind === "open" && (
            <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
          )}
          <span className="truncate text-[13.5px] font-bold text-foreground">
            {stage.name}
          </span>
        </div>
        <span className="rounded-full bg-white/60 dark:bg-slate-800/60 border border-white/50 dark:border-white/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-muted-foreground shadow-xs">
          {leads.length}
        </span>
      </div>

      {/* Lista de tarjetas draggables */}
      <div className="flex-1 space-y-2.5 overflow-y-auto p-3 min-h-[140px]">
        {leads.length === 0 ? (
          <div className="flex h-28 flex-col items-center justify-center rounded-xl border border-dashed border-white/40 dark:border-white/10 p-3 text-center text-xs text-muted-foreground/70">
            <p>Sin contactos</p>
            <p className="text-[10px] mt-0.5">Desliza o suelta tarjetas aquí</p>
          </div>
        ) : (
          leads.map((lead) => (
            <DraggableLead
              key={lead.id}
              lead={lead}
              stageIndex={stageIndex}
              totalStages={totalStages}
              currency={currency}
              onEditAmount={onEditAmount}
              onOpen={onOpen}
              onSlide={onSlide}
            />
          ))
        )}
      </div>

      {/* Resumen financiero de la columna */}
      <StageFooter leads={leads} currency={currency} />
    </div>
  );
}

function StageFooter({ leads, currency }: { leads: BoardLead[]; currency: string }) {
  const { totalCents, sinMonto, otraMoneda } = totalesDeEtapa(leads, currency);
  const conMonto = leads.length - sinMonto - otraMoneda;

  return (
    <div className="border-t border-white/40 dark:border-white/10 px-3.5 py-2.5 text-[11.5px] bg-white/20 dark:bg-slate-900/20 rounded-b-2xl">
      {conMonto === 0 ? (
        <p className="text-muted-foreground/80 italic text-center">Sin montos capturados</p>
      ) : (
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-muted-foreground">
            Total{sinMonto > 0 ? ` (${sinMonto} sin monto)` : ""}
          </span>
          <span className="font-bold text-foreground tabular-nums">
            {formatMoneyCents(totalCents, currency)}
          </span>
        </div>
      )}
      {otraMoneda > 0 && (
        <p className="mt-0.5 text-amber-600 dark:text-amber-400 text-[10.5px]">
          {otraMoneda} en otra moneda, fuera del total
        </p>
      )}
    </div>
  );
}

function DraggableLead({
  lead,
  stageIndex,
  totalStages,
  currency,
  onEditAmount,
  onOpen,
  onSlide,
}: {
  lead: BoardLead;
  stageIndex: number;
  totalStages: number;
  currency: string;
  onEditAmount: (lead: BoardLead) => void;
  onOpen: (lead: BoardLead) => void;
  onSlide: (lead: BoardLead, direction: "prev" | "next") => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: lead.id,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => onOpen(lead)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(lead);
        }
      }}
      aria-label={`Abrir trato de ${lead.contact.name}`}
      className={cn("transition-opacity outline-none", isDragging && "opacity-30")}
    >
      <LeadCard
        lead={lead}
        stageIndex={stageIndex}
        totalStages={totalStages}
        currency={currency}
        onEditAmount={onEditAmount}
        onSlide={onSlide}
      />
    </div>
  );
}

function LeadCard({
  lead,
  stageIndex = 0,
  totalStages = 1,
  currency,
  overlay = false,
  onEditAmount,
  onSlide,
}: {
  lead: BoardLead;
  stageIndex?: number;
  totalStages?: number;
  currency: string;
  overlay?: boolean;
  onEditAmount?: (lead: BoardLead) => void;
  onSlide?: (lead: BoardLead, direction: "prev" | "next") => void;
}) {
  const canSlidePrev = stageIndex > 0;
  const canSlideNext = stageIndex < totalStages - 1;

  return (
    <div
      className={cn(
        "group/card relative cursor-grab rounded-xl border border-white/60 dark:border-white/10 bg-white/85 dark:bg-slate-800/85 backdrop-blur-sm p-3.5 shadow-sm transition-all duration-200 hover:shadow-md hover:border-primary/40 active:cursor-grabbing",
        overlay && "rotate-2 shadow-xl ring-2 ring-primary/40 bg-white dark:bg-slate-800"
      )}
    >
      {/* Información del Contacto */}
      <div className="flex items-start gap-2.5">
        <ContactAvatar name={lead.contact.name} seed={lead.contact.id} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="truncate text-sm font-bold text-foreground">
              {lead.contact.name}
            </p>
            {lead.priority && <PriorityBadge value={lead.priority} />}
          </div>

          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            {lead.contact.phone && (
              <span className="truncate">{formatPhone(lead.contact.phone)}</span>
            )}
            {lead.lastActivityAt && (
              <span className="truncate">· {formatTime(lead.lastActivityAt)}</span>
            )}
          </div>
        </div>

        {/* Acceso directo a conversación de chat */}
        {lead.conversationId && (
          <Link
            href={`/inbox?contact=${lead.contact.id}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            title="Abrir conversación en bandeja"
            className="rounded-lg p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors shrink-0"
          >
            <MessageSquareText className="h-4 w-4" />
          </Link>
        )}
      </div>

      {/* Controles de Estado y Monto */}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-black/5 dark:border-white/5 pt-2">
        {/* Deslizador manual de estados (flechas izquierda/derecha) */}
        {!overlay && onSlide && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={!canSlidePrev}
              title={canSlidePrev ? "Deslizar a etapa anterior" : "Primera etapa"}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                if (canSlidePrev) onSlide(lead, "prev");
              }}
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-md border text-slate-600 dark:text-slate-300 transition-all",
                canSlidePrev
                  ? "border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/10 hover:text-foreground active:scale-95"
                  : "border-transparent opacity-20 cursor-not-allowed"
              )}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              disabled={!canSlideNext}
              title={canSlideNext ? "Deslizar a siguiente etapa" : "Última etapa"}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                if (canSlideNext) onSlide(lead, "next");
              }}
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-md border text-slate-600 dark:text-slate-300 transition-all",
                canSlideNext
                  ? "border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/10 hover:text-foreground active:scale-95"
                  : "border-transparent opacity-20 cursor-not-allowed"
              )}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Captura de Monto */}
        {!overlay && onEditAmount && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onEditAmount(lead);
            }}
            title="Editar importe negociado"
            className={cn(
              "rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums transition-colors ml-auto",
              lead.amountCents === null
                ? "text-muted-foreground/70 hover:bg-primary/10 hover:text-primary font-normal"
                : "bg-primary/10 text-primary hover:bg-primary/20"
            )}
          >
            {lead.amountCents === null
              ? "+ monto"
              : formatMoneyCents(lead.amountCents, lead.currency ?? currency)}
          </button>
        )}

        {overlay && lead.amountCents !== null && (
          <p className="ml-auto text-xs font-bold tabular-nums text-primary">
            {formatMoneyCents(lead.amountCents, lead.currency ?? currency)}
          </p>
        )}
      </div>
    </div>
  );
}
