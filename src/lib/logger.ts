/**
 * Logger estructurado de una línea de JSON por evento (zero-dependency).
 *
 * Por qué existe: el núcleo logueaba con `console.*` plano, así que un
 * operador self-hosted no podía greppear por nivel ni ingerir los logs en
 * Loki/Docker sin parsear texto libre. Este módulo emite JSON en stdout
 * (donde `docker logs` / Coolify ya recogen), sin dependencias nuevas ni
 * servicios externos — la soberanía del núcleo queda intacta.
 *
 * Contrato:
 * - `logger.info("webhook", { id })` →
 *   `{"ts":"…","level":"info","scope":"webhook","msg":"…","id":"…"}`
 * - Campos extra van aplanados al objeto raíz (no anidados bajo "data").
 * - `err` es la clave reservada para errores: se serializa con mensaje y
 *   stack recortado, jamás el objeto completo (que en Node vota [object Object]).
 * - LOG_LEVEL (opcional): debug | info | warn | error (default info).
 *   Sin variable, todo excepto debug se emite — cero configuración para
 *   operar, como el resto de las banderas del proyecto.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;

type Level = keyof typeof LEVELS;

function configuredLevel(): number {
  const raw = process.env.LOG_LEVEL?.toLowerCase();
  if (raw && raw in LEVELS) return LEVELS[raw as Level];
  return LEVELS.info;
}

/** Stack a string corto: las primeras líneas bastan para ubicar el fallo. */
function serializeError(err: unknown): string {
  if (err instanceof Error) {
    const stack = err.stack?.split("\n").slice(0, 6).join(" | ");
    return stack ?? `${err.name}: ${err.message}`;
  }
  return String(err);
}

function emit(level: Level, scope: string, msg: string, extra?: Record<string, unknown>): void {
  if (LEVELS[level] < configuredLevel()) return;
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    scope,
    msg,
  };
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      entry[key] = key === "err" ? serializeError(value) : value;
    }
  }
  // Una línea por evento: los recolectores parten por \n.
  process.stdout.write(`${JSON.stringify(entry)}\n`);
}

export type Logger = {
  debug: (msg: string, extra?: Record<string, unknown>) => void;
  info: (msg: string, extra?: Record<string, unknown>) => void;
  warn: (msg: string, extra?: Record<string, unknown>) => void;
  error: (msg: string, extra?: Record<string, unknown>) => void;
};

/** Logger con scope fijo (`createLogger("webhook").warn(...)`) — el estilo [webhook] de antes, tipado. */
export function createLogger(scope: string): Logger {
  return {
    debug: (msg, extra) => emit("debug", scope, msg, extra),
    info: (msg, extra) => emit("info", scope, msg, extra),
    warn: (msg, extra) => emit("warn", scope, msg, extra),
    error: (msg, extra) => emit("error", scope, msg, extra),
  };
}

/**
 * Migra una llamada `console.warn("[scope] …", err)` a logger sin tocar el
 * call-site más que el prefijo. Pensado para la transición: los archivos van
 * migrando de a poco y ambos estilos conviven sin romper nada.
 */
export function logAt(level: Level, scope: string, msg: string, extra?: Record<string, unknown>): void {
  emit(level, scope, msg, extra);
}
