"use client";

import { useI18n } from "@/components/i18n-provider";

import { useCallback, useEffect, useState } from "react";
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
import { MessageSquareText, Settings2, Trophy, XCircle } from "lucide-react";
import type { LossReason, PriorityValue, StageDto } from "@/lib/types";
import { formatMoneyCents, sumable } from "@/lib/money";
import { cn } from "@/lib/utils";
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
  const { t: tr } = useI18n();

  const [stages, setStages] = useState<StageDto[]>([]);
  const [currency, setCurrency] = useState("MXN");
  const [leads, setLeads] = useState<BoardLead[]>([]);
  const [activeLead, setActiveLead] = useState<BoardLead | null>(null);
  const [managing, setManaging] = useState(false);
  /** Arrastre hacia una etapa perdida, esperando el motivo. */
  const [pendingLoss, setPendingLoss] = useState<{
    leadId: string;
    stageId: string;
    name: string;
  } | null>(null);
  /** Tarjeta cuyo monto se está capturando. */
  const [editandoMonto, setEditandoMonto] = useState<BoardLead | null>(null);
  /**
   * Trato abierto en el cajón. Se guarda el ID y no el objeto: así el cajón
   * lee siempre del tablero y refleja al instante lo que se cambie desde
   * dentro, en vez de enseñar una copia que envejece.
   */
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const abierto = leads.find((l) => l.id === abiertoId) ?? null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const refetch = useCallback(async () => {
    const res = await fetch("/api/pipeline/board").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as {
      stages: StageDto[];
      leads: BoardLead[];
      currency?: string;
    };
    if (data.currency) setCurrency(data.currency);
    setStages(data.stages);
    setLeads(data.leads);
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

  async function guardarMonto(leadId: string, cents: number | null) {
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, amountCents: cents } : l))
    );
    await fetch(`/api/pipeline/leads/${leadId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      // Sin `stageId`: esto NO mueve la tarjeta, solo escribe el importe.
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

    // Perder un trato exige motivo. Se pregunta ANTES de mover: si el dueño
    // cancela, la tarjeta ni siquiera parpadea fuera de su columna.
    const destino = stages.find((s) => s.id === overStage);
    if (destino?.kind === "lost") {
      setPendingLoss({ leadId, stageId: overStage, name: lead.contact.name });
      return;
    }

    await moverLead(leadId, overStage);
  }

  /**
   * Cambiar de etapa desde el cajón. Entra por la MISMA puerta que el
   * arrastre: perder un trato exige motivo venga de donde venga, y duplicar
   * esa regla aquí sería tener dos sitios donde olvidarla.
   */
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
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 sm:px-6 sm:py-4">
        <h2 className="text-[17px] font-bold tracking-tight">{tr("Pipeline")}</h2>
        <Button variant="outline" size="sm" onClick={() => setManaging(true)}>
          <Settings2 className="h-4 w-4" /> {tr(" Gestionar etapas")}</Button>
      </header>

      {/* El tablero se arrastra en horizontal; en el teléfono cada columna
          se detiene en su sitio (snap) para no quedar a medio camino. */}
      <div className="flex-1 snap-x snap-mandatory overflow-x-auto p-3 sm:snap-none sm:p-4">
        <DndContext
          sensors={sensors}
          onDragStart={onDragStart}
          onDragEnd={(e) => void onDragEnd(e)}
        >
          <div className="flex h-full gap-3">
            {stages.map((stage) => (
              <StageColumn
                key={stage.id}
                stage={stage}
                currency={currency}
                onEditAmount={setEditandoMonto}
                onOpen={(l) => setAbiertoId(l.id)}
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
      </div>

      {managing && (
        <StageManager
          stages={stages}
          onClose={() => setManaging(false)}
          onChanged={() => void refetch()}
        />
      )}

      {/* Va ANTES que los diálogos: con el mismo z-index, el que se pinta
          después queda encima, y el motivo de pérdida debe tapar al cajón. */}
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

/**
 * Totales de una columna. Se calculan al pintar: un total guardado se
 * desincroniza en cuanto alguien mueve una tarjeta, y sumar unas decenas es
 * gratis. Todo en CENTAVOS enteros — el dinero jamás pasa por coma flotante.
 */
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
  leads,
  currency,
  onEditAmount,
  onOpen,
}: {
  stage: StageDto;
  leads: BoardLead[];
  currency: string;
  onEditAmount: (lead: BoardLead) => void;
  onOpen: (lead: BoardLead) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex h-full w-64 shrink-0 snap-start flex-col rounded-lg border border-border-strong bg-subtle transition-[box-shadow,border-color]",
        isOver && "border-brand ring-[3px] ring-brand-soft"
      )}
    >
      <div className="flex items-center justify-between px-3 py-2.5">
        <span className="flex items-center gap-1.5 text-[13.5px] font-bold tracking-tight">
          {stage.kind === "won" && <Trophy className="h-3.5 w-3.5 text-primary" />}
          {stage.kind === "lost" && (
            <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          {stage.name}
        </span>
        <span className="rounded-full border border-border-strong bg-background px-2 py-0.5 font-mono text-[11px] text-text-3">
          {leads.length}
        </span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {leads.map((lead) => (
          <DraggableLead
            key={lead.id}
            lead={lead}
            currency={currency}
            onEditAmount={onEditAmount}
            onOpen={onOpen}
          />
        ))}
      </div>
      <StageFooter leads={leads} currency={currency} />
    </div>
  );
}

/** Cuánto dinero hay en esta etapa, y qué quedó fuera de la cuenta. */
function StageFooter({ leads, currency }: { leads: BoardLead[]; currency: string }) {
  const { t: tr } = useI18n();

  const { totalCents, sinMonto, otraMoneda } = totalesDeEtapa(leads, currency);
  const conMonto = leads.length - sinMonto - otraMoneda;

  return (
    <div className="border-t px-3 py-2 text-[11px]">
      {conMonto === 0 ? (
        // Un "$0.00" aquí se lee como un error del sistema, no como un dato.
        <p className="text-muted-foreground">{tr("Sin montos capturados")}</p>
      ) : (
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-muted-foreground">
            {tr("Total")}{sinMonto > 0 ? tr(" · {v0} sin monto", {v0: sinMonto}) : ""}
          </span>
          <span className="font-semibold tabular-nums">
            {formatMoneyCents(totalCents, currency, tr.intl)}
          </span>
        </div>
      )}
      {otraMoneda > 0 && (
        // Descartarlos en silencio haría que el total mintiera sin que nadie
        // pudiera notarlo.
        <p className="mt-0.5 text-warning-text">
          {otraMoneda} {tr(" en otra moneda, fuera del total")}</p>
      )}
    </div>
  );
}

function DraggableLead({
  lead,
  currency,
  onEditAmount,
  onOpen,
}: {
  lead: BoardLead;
  currency: string;
  onEditAmount: (lead: BoardLead) => void;
  onOpen: (lead: BoardLead) => void;
}) {
  const { t: tr } = useI18n();

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: lead.id,
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      // Abrir y arrastrar conviven porque el sensor solo activa el arrastre a
      // los 6 px de movimiento: un clic quieto nunca llega a ser un arrastre.
      // Los controles de dentro de la tarjeta cortan la propagación, para que
      // tocar "+ monto" no abra además el cajón.
      onClick={() => onOpen(lead)}
      // dnd-kit ya deja el nodo con `role="button"` y `tabIndex`, pero un div
      // no dispara `click` con el teclado: sin esto, el cajón sería alcanzable
      // solo con el ratón.
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(lead);
        }
      }}
      aria-label={tr("Abrir el trato de {v0}", {v0: lead.contact.name})}
      className={cn(isDragging && "opacity-40")}
    >
      <LeadCard lead={lead} currency={currency} onEditAmount={onEditAmount} />
    </div>
  );
}

function LeadCard({
  lead,
  currency,
  overlay = false,
  onEditAmount,
}: {
  lead: BoardLead;
  currency: string;
  overlay?: boolean;
  onEditAmount?: (lead: BoardLead) => void;
}) {
  const { t: tr } = useI18n();

  return (
    <div
      className={cn(
        "cursor-grab rounded-md border border-border-strong bg-card p-3 shadow-sm transition-shadow hover:shadow-md",
        overlay && "rotate-2 shadow-pop"
      )}
    >
      <div className="flex items-center gap-2.5">
        <ContactAvatar name={lead.contact.name} seed={lead.contact.id} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-semibold">{lead.contact.name}</p>
            {lead.priority && <PriorityBadge value={lead.priority} />}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {lead.lastActivityAt
              ? tr("Actividad: {v0}", {v0: formatTime(lead.lastActivityAt, tr.locale)})
              : tr("Sin actividad")}
          </p>
        </div>
        {lead.conversationId && (
          <Link
            href={`/inbox?contact=${lead.contact.id}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            aria-label={tr("Abrir conversación")}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <MessageSquareText className="h-4 w-4" />
          </Link>
        )}
      </div>
      {!overlay && onEditAmount && (
        <button
          // `stopPropagation` en pointerdown: sin esto, tocar el monto empieza
          // un arrastre y el diálogo nunca abre.
          onPointerDown={(e) => e.stopPropagation()}
          // También en `click`: sin esto, tocar el monto abriría además el
          // cajón, porque el evento sigue subiendo hasta la tarjeta.
          onClick={(e) => {
            e.stopPropagation();
            onEditAmount(lead);
          }}
          className={cn(
            "mt-1.5 w-full rounded px-1 py-0.5 text-right text-xs tabular-nums hover:bg-accent",
            lead.amountCents === null
              ? "text-text-3"
              : "font-semibold text-foreground"
          )}
        >
          {lead.amountCents === null
            ? tr("+ monto")
            : formatMoneyCents(lead.amountCents, lead.currency ?? currency, tr.intl)}
        </button>
      )}
      {overlay && lead.amountCents !== null && (
        <p className="mt-1.5 text-right text-xs font-semibold tabular-nums">
          {formatMoneyCents(lead.amountCents, lead.currency ?? currency, tr.intl)}
        </p>
      )}
    </div>
  );
}
