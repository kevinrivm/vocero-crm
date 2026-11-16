import { systemText, type Locale } from "@/lib/i18n";
/**
 * «Quién responde a tus clientes»: el contrato entre
 * `GET /api/agent/brain-status` y la UI (la tarjeta del Agente y el panel de
 * contacto). Solo tipos y textos: lo importan componentes de cliente, así que
 * aquí no entra nada de servidor. El cálculo vive en `server/bot/status.ts`.
 *
 * Desde la 036 el CRM no trae agente: contesta el cerebro conectado (Nea u
 * otro), y solo si el interruptor del Agente lo deja.
 */

/** Los modos de Nea tal como los reporta su `/health`. */
export const BRAIN_MODES = ["estándar", "cloud", "multiorg"] as const;
export type BrainMode = (typeof BRAIN_MODES)[number];

/** Por qué el `/health` del cerebro externo no cuenta como «en línea». */
export type BrainHealthProblem =
  /** No contestó dentro del límite (2 s). */
  | "timeout"
  /** No se pudo conectar: nombre que no resuelve, puerto cerrado… */
  | "network"
  /** Contestó con un código distinto de 200 (`httpStatus`). */
  | "status"
  /** Contestó con una redirección; no se sigue. */
  | "redirect"
  /** 200, pero sin JSON o sin decir que está sano. */
  | "invalid"
  /** `BRAIN_HEALTH_URL` no es una URL http(s): no se le preguntó a nadie. */
  | "config";

/** La cola de Nea hacia el CRM (el «relevo» de los webhooks). */
export type BrainRelayDto = {
  /** Mensajes entrantes que esperan llegar al CRM. */
  pendientes: number | null;
  masViejoSegundos: number | null;
  ultimoErrorEn: string | null;
};

export type BrainHealthDto = {
  reachable: boolean;
  /** Solo host[:puerto]: jamás credenciales, ruta ni query de la URL. */
  host: string;
  checkedAt: string;
  problem?: BrainHealthProblem;
  httpStatus?: number;
  version?: string;
  commit?: string;
  commitVerified?: boolean;
  mode?: BrainMode;
  relay?: BrainRelayDto;
};

/**
 * 036 — `sin_cerebro`: no hay despacho configurado; la bandeja es manual
 * (informativo, no un error). `apagado`: hay cerebro y el interruptor del
 * Agente no deja que el CRM le despache.
 */
export type BrainWarning = "sin_cerebro" | "apagado";

/**
 * 021 — El despacho: el CRM le empuja cada turno al cerebro externo
 * (`BRAIN_DISPATCH_URL`). Los hechos salen de la tabla `dispatch`, así que
 * sobreviven a un reinicio.
 */
export type BrainDispatchDto = {
  /** URL válida y `BOT_API_KEY`: el CRM está empujando turnos. */
  active: boolean;
  /** Solo host[:puerto]. `null` sin `BRAIN_DISPATCH_URL` o si no es una URL. */
  host: string | null;
  /** `url`: no es http(s) o lleva usuario y clave. `sin_llave`: falta
   *  `BOT_API_KEY`. Con problema, el despacho NO está activo. */
  problem: "url" | "sin_llave" | null;
  lastDeliveredAt: string | null;
  /** El último turno que no llegó (caducó) o que se sigue reintentando. */
  lastFailure: { at: string; detail: string } | null;
  /** Turnos esperando su ventana o un reintento. */
  pending: number;
};

/** Lo que devuelve una instancia que no despacha. */
export const SIN_DESPACHO: BrainDispatchDto = {
  active: false,
  host: null,
  problem: null,
  lastDeliveredAt: null,
  lastFailure: null,
  pending: 0,
};

export type BrainStatusDto = {
  /** 036 — El interruptor del Agente: el CRM le despacha al cerebro. */
  enabled: boolean;
  /** Hay con qué pensar: la llave de Ajustes → IA (o `OPENROUTER_API_TOKEN`
   *  de respaldo), que el cerebro usa por `/api/bot/llm`. */
  aiConfigured: boolean;
  external: {
    /** `BOT_API_KEY` válida: la API `/api/bot/*` está abierta. */
    keyConfigured: boolean;
    /** Última llamada autenticada a `/api/bot/*`. En memoria: se cuenta
     *  desde el último arranque del CRM. */
    lastSeenAt: string | null;
    /** Parece estar contestando: llamó en las últimas 24 h, su `/health`
     *  está en línea, o el CRM le está despachando los turnos. */
    active: boolean;
    /** `null` si no hay `BRAIN_HEALTH_URL`: no se le pregunta a nadie. */
    health: BrainHealthDto | null;
  };
  /** 021: el despacho del CRM al cerebro. */
  dispatch: BrainDispatchDto;
  warning: BrainWarning | null;
};

/**
 * El nombre que se puede afirmar. «Nea» solo si su `/health` habla el
 * contrato de Nea (trae `mode`); con un bot propio o una Nea vieja no se
 * inventa ninguno.
 */
export function externalBrainName(status: BrainStatusDto): string | null {
  return status.external.health?.mode ? "Nea" : null;
}

/**
 * Hasta donde el CRM puede saber, el cerebro está contestando: el CRM le
 * despacha (despacho activo e interruptor encendido) y, si se le pregunta a su
 * `/health`, no está caído.
 */
export function externalAnswering(status: BrainStatusDto): boolean {
  const h = status.external.health;
  return status.dispatch.active && status.enabled && (!healthKnown(h) || h.reachable);
}

/** Se le pregunta a su `/health` y no está en línea. */
export function externalDown(status: BrainStatusDto): boolean {
  const h = status.external.health;
  return healthKnown(h) && !h.reachable;
}

/** Su `/health` dice algo. Con `BRAIN_HEALTH_URL` mal escrita no se le pudo
 *  preguntar: no se sabe si está en línea, y se juzga como si no hubiera URL
 *  (por su última llamada), no como caído. */
function healthKnown(h: BrainHealthDto | null): h is BrainHealthDto {
  return h !== null && h.problem !== "config";
}

/** «Responde tu cerebro externo (Nea)», o sin paréntesis si no se sabe quién es. */
export function externalAnswerLabel(status: BrainStatusDto): string {
  const name = externalBrainName(status);
  return name
    ? `Responde tu cerebro externo (${name})`
    : "Responde tu cerebro externo";
}

/** «hace 3 min». Tolera relojes desfasados: el futuro es «hace unos segundos». */
export function haceCuanto(iso: string, now: number = Date.now(), locale: Locale = "es"): string {
  const s = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  if (!Number.isFinite(s) || s < 60) return systemText(locale, "hace unos segundos");
  const m = Math.floor(s / 60);
  if (m < 60) return systemText(locale, `hace ${m} min`);
  const h = Math.floor(m / 60);
  if (h < 24) return systemText(locale, `hace ${h} h`);
  const d = Math.floor(h / 24);
  return systemText(locale, d === 1 ? "hace 1 día" : `hace ${d} días`);
}

/**
 * 021 — El último turno no llegó al cerebro y desde entonces no ha llegado
 * ninguno. Un fallo viejo, con entregas después, ya no es una alarma.
 */
export function despachoFallando(d: BrainDispatchDto): boolean {
  if (!d.active || !d.lastFailure) return false;
  if (!d.lastDeliveredAt) return true;
  return Date.parse(d.lastFailure.at) > Date.parse(d.lastDeliveredAt);
}
