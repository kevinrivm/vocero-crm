import type { LossReason, SourceValue, StageDto } from "@/lib/types";

/**
 * 019 — Contratos y aritmética de la pantalla Resultados.
 *
 * Portado de Vocero Cloud (101 W6 + la tabla por anuncio de 212) SIN gasto
 * publicitario: fuera la carga manual, el costo por prospecto y el retorno
 * (decisión del dueño, spec 019 D1). Lo de origen y anuncios viaja en conteos.
 *
 * Vive en `lib/` y no en `server/` porque las secciones se pintan en el
 * cliente y no pueden arrastrar la BD al bundle — mismo criterio que
 * `lib/money.ts`.
 */

export type StageKind = StageDto["kind"];

/** Debajo de esta muestra, un porcentaje es una anécdota. */
export const MIN_SAMPLE = 10;

/**
 * Toda tasa de la pantalla pasa por aquí.
 *
 * Hay más de diez repartidas en cuatro bloques, y cada una es una oportunidad
 * de dividir entre cero, de presentar un 100 % sostenido en un solo caso, o de
 * enseñar el porcentaje sin el número absoluto que lo hace interpretable. Un
 * solo helper convierte esas tres reglas en algo que no se puede olvidar.
 * **La UI no divide.**
 */
export type RateDto = {
  /** Porcentaje entero 0-100, o `null` si no hay denominador. */
  value: number | null;
  /** El denominador: se muestra SIEMPRE junto al porcentaje. */
  sample: number;
  /** false = muestra chica; la UI lo marca en vez de presentarlo como firme. */
  reliable: boolean;
};

export function rate(numerator: number, denominator: number): RateDto {
  if (denominator <= 0) return { value: null, sample: 0, reliable: false };
  return {
    value: Math.round((numerator / denominator) * 100),
    sample: denominator,
    reliable: denominator >= MIN_SAMPLE,
  };
}

/** Un número del periodo y el mismo número del periodo anterior. */
export type Comparable = { current: number; previous: number };

export function comparable(current: number, previous: number): Comparable {
  return { current, previous };
}

/** Variación porcentual; `null` cuando no hay base con la cual comparar. */
export function delta(c: Comparable): number | null {
  if (c.previous === 0) return null;
  return Math.round(((c.current - c.previous) / c.previous) * 100);
}

export type PeriodDto = {
  /** `YYYY-MM-DD` en la zona del negocio. */
  from: string;
  to: string;
  previousFrom: string;
  previousTo: string;
  timezone: string;
  /** Cómo se agrupa la serie: por día en rangos cortos, por mes en largos. */
  granularity: "day" | "month";
  days: number;
};

/**
 * Todas las cubetas del periodo, en orden. Un día sin movimientos es un cero en
 * la gráfica, no un hueco: sin él, las barras del martes y del viernes quedarían
 * juntas y la serie mentiría sobre el ritmo.
 */
export function bucketsDelPeriodo(
  p: Pick<PeriodDto, "from" | "to" | "granularity">
): string[] {
  const out: string[] = [];
  if (p.granularity === "month") {
    let y = Number(p.from.slice(0, 4));
    let m = Number(p.from.slice(5, 7));
    const ty = Number(p.to.slice(0, 4));
    const tm = Number(p.to.slice(5, 7));
    // Tope defensivo: el rango máximo es de 366 días (13 meses a lo sumo).
    while ((y < ty || (y === ty && m <= tm)) && out.length < 24) {
      out.push(`${y}-${String(m).padStart(2, "0")}`);
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
    return out;
  }
  const fin = Date.parse(`${p.to}T00:00:00Z`);
  for (
    let t = Date.parse(`${p.from}T00:00:00Z`);
    t <= fin && out.length < 400;
    t += 86_400_000
  ) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/* ── Ventas y embudo ────────────────────────────────────────────── */

export type FunnelStepDto = {
  stageId: string | null;
  name: string;
  kind: StageKind;
  /** Leads que ALCANZARON esta etapa, contados una sola vez por lead. */
  reached: number;
  /** Qué proporción de los que llegaron aquí pasó a la siguiente. */
  advanceRate: RateDto | null;
};

export type StageTimingDto = {
  stageId: string | null;
  name: string;
  avgDays: number | null;
  sample: number;
};

export type LossReasonRowDto = {
  reason: LossReason | "sin_registro";
  label: string;
  count: number;
};

export type SalesBlockDto = {
  period: PeriodDto;
  kpis: {
    newLeads: Comparable;
    won: Comparable;
    lost: Comparable;
    wonCents: Comparable;
    winRate: RateDto;
    avgTicketCents: number | null;
  };
  /**
   * El embudo de HOY, no del periodo. Sin «dinero esperado»: la probabilidad
   * de cierre que lo calcula en Cloud no existe en el raíz (spec 019, D5).
   */
  pipeline: {
    openCents: number;
    /** Leads en etapas abiertas que aún no tienen monto capturado. */
    withoutAmount: number;
    /** Leads excluidos del total por estar en otra moneda. */
    otherCurrency: number;
  };
  series: { bucket: string; newLeads: number; won: number; wonCents: number }[];
  funnel: FunnelStepDto[];
  timing: StageTimingDto[];
  timeToWinDays: number | null;
  /**
   * Fecha desde la que el historial es completo. Antes de ella hay eventos
   * sembrados por la migración y los tiempos no se calculan. `null` si nunca
   * hubo eventos sembrados: entonces no hay nada que advertir.
   */
  completeFrom: string | null;
  lossReasons: LossReasonRowDto[];
  /** true = no hubo NADA en el periodo; la UI lo dice en vez de pintar ceros. */
  empty: boolean;
};

/* ── Origen y anuncios (solo conteos) ───────────────────────────── */

export type SourceKey = SourceValue | "desconocida";

export type SourceRowDto = {
  value: SourceKey;
  label: string;
  /** Conversaciones que EMPEZARON en el periodo. */
  conversations: number;
  /** Prospectos (leads) creados en el periodo. */
  leads: number;
  /** De esos prospectos, cuántos están hoy en Ganado. */
  won: number;
  winRate: RateDto;
};

/** 018 — Prospectos del periodo por el anuncio que los trajo. */
export type AdRowDto = {
  /** `source_id`, o el id de la fila de origen si Meta no mandó ninguno. */
  key: string;
  sourceId: string | null;
  /** `post` si fue una publicación y no un anuncio. */
  sourceType: string | null;
  headline: string | null;
  /** Imagen del creativo, servida por `/api/media/{id}`. */
  imageAssetId: string | null;
  conversations: number;
  leads: number;
  won: number;
  winRate: RateDto;
};

export type AdsBlockDto = {
  period: PeriodDto;
  /** Conversaciones que empezaron en el periodo, contra el anterior. */
  conversations: Comparable;
  /** Qué parte de esas conversaciones llegó con origen «anuncio». */
  adShare: RateDto;
  sources: SourceRowDto[];
  ads: AdRowDto[];
  empty: boolean;
};

/* ── El trabajo del agente ──────────────────────────────────────── */

export type LabeledCountDto = { key: string; label: string; count: number };

export type SessionsDto = {
  booked: number;
  done: number;
  noShow: number;
  cancelled: number;
  showRate: RateDto;
};

export type BotBlockDto = {
  period: PeriodDto;
  /** Conversaciones que empezaron en el periodo. */
  conversations: number;
  /** De las que tienen mensaje del cliente, en cuántas contestó el agente. */
  aiReplyRate: RateDto;
  /** Mediana en segundos; `null` si no hubo ninguna respuesta que medir. */
  firstResponseSeconds: number | null;
  firstResponseSample: number;
  /** De las conversaciones del periodo, las que pasaron a un humano. */
  handoffs: LabeledCountDto[];
  handoffRate: RateDto;
  /** `null` con la bandera AGENDA apagada: sin agenda no hay citas que contar. */
  sessions: SessionsDto | null;
  /**
   * Cuántos contactos tienen ficha. `null` cuando el perfil del agente no la
   * escribe: no es 0 %, es que esa medida no aplica en esta instalación.
   */
  fichaCoverage: RateDto | null;
  empty: boolean;
};

/* ── Higiene (el ahora, sin rango) ──────────────────────────────── */

export type HygieneBlockDto = {
  /** Los primeros de la lista; `silentCount` dice cuántos son en total. */
  silent: {
    leadId: string;
    contactId: string;
    name: string;
    days: number;
    amountCents: number | null;
  }[];
  silentCount: number;
  /** Dinero de TODOS los leads en silencio, en la moneda del negocio. */
  silentAmountCents: number;
  failedMessages: { error: string; count: number; lastAt: string }[];
  closingWindows: {
    conversationId: string;
    contactId: string;
    name: string;
    hoursLeft: number;
  }[];
  clean: boolean;
};

/* ── Etiquetas ──────────────────────────────────────────────────── */

/** Mismas palabras que la ficha del contacto y el panel de la bandeja. */
export const HANDOFF_LABEL: Record<string, string> = {
  cliente: "El cliente pidió un humano",
  modelo: "El agente decidió escalar",
  error: "Error del proveedor de IA",
  ventana: "Ventana de 24 h cerrada",
  hostilidad: "El cliente se puso agresivo",
  manual_reply: "Respondió una persona del equipo",
  sin_respuesta: "El agente no logró contestar",
};
