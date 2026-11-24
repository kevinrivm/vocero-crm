/**
 * 077 — Clientes que esperan a una persona.
 *
 * Lo que ve el equipo en tres sitios (la pestaña «Esperando» de la Bandeja, el
 * cintillo de arriba de la app y el aviso de los 15 minutos) sale de AQUÍ, y
 * de un solo dato que calcula el servidor por conversación: `espera`
 * (`server/inbox/esperando.ts`). Si cada sitio contara a su manera, el
 * cintillo diría «3 esperan» y la pestaña enseñaría otra cuenta.
 *
 * Puro y sin dependencias de servidor: lo usan los componentes, el layout y
 * las pruebas.
 */

/**
 * Desde cuándo espera y hasta cuándo se le puede contestar sin plantilla.
 * Lo pone el servidor; null = no espera a nadie.
 */
export type EsperaDto = {
  /** El primer mensaje del cliente que nadie ha contestado (ISO). */
  desde: string;
  /** Hasta cuándo una persona puede contestarle con texto libre (ISO). */
  hasta: string;
};

/** Neutro por debajo de este minuto. */
export const UMBRAL_AMBAR_MIN = 5;
/** Rojo desde este minuto (de 5 a 14 es ámbar). Coincide con el aviso. */
export const UMBRAL_ROJO_MIN = 15;
/** A partir de aquí, aviso con sonido (una vez por espera y por persona). */
export const UMBRAL_AVISO_MIN = 15;
/** Cada cuánto se vuelve a mirar el reloj en pantalla. No pide nada al servidor. */
export const RELOJ_MS = 30_000;
/**
 * Respaldo de baja frecuencia: lo normal es que la lista se refresque con el
 * tiempo real (`/api/events`). Esto solo cubre un evento perdido.
 */
export const RESPALDO_MS = 5 * 60_000;

export type NivelEspera = "neutro" | "ambar" | "rojo";

/** ¿Espera a una persona AHORA? Con la ventana cerrada ya no cuenta. */
export function estaEsperando(
  c: { espera?: EsperaDto | null },
  ahora: number = Date.now()
): boolean {
  if (!c.espera) return false;
  const hasta = Date.parse(c.espera.hasta);
  return Number.isFinite(hasta) && ahora < hasta;
}

/** Minutos de reloj desde `desde`. Nunca negativo. */
export function minutosDeEspera(desde: string, ahora: number = Date.now()): number {
  const t = Date.parse(desde);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((ahora - t) / 60_000));
}

export function nivelDeEspera(minutos: number): NivelEspera {
  if (minutos < UMBRAL_AMBAR_MIN) return "neutro";
  if (minutos < UMBRAL_ROJO_MIN) return "ambar";
  return "rojo";
}

/** «7 min», «1 h 05 min», «3 h». */
export function textoMinutos(minutos: number): string {
  const m = Math.max(0, Math.floor(minutos));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const resto = m % 60;
  return resto === 0 ? `${h} h` : `${h} h ${String(resto).padStart(2, "0")} min`;
}

/** «3 clientes esperan a una persona · el que más lleva: 42 min». */
export function textoCintillo(total: number, minutosDelMasAntiguo: number): string {
  const lleva = textoMinutos(minutosDelMasAntiguo);
  return total === 1
    ? `1 cliente espera a una persona · lleva ${lleva}`
    : `${total} clientes esperan a una persona · el que más lleva: ${lleva}`;
}

export type Espera = {
  id: string;
  nombre: string;
  desde: string;
  minutos: number;
};

type ConEspera = { id: string; contact: { name: string }; espera?: EsperaDto | null };

/**
 * Las que esperan, de la que más lleva a la que menos. Es la MISMA lista para
 * la pestaña, el cintillo y el aviso.
 */
export function esperasDe(lista: readonly ConEspera[], ahora: number = Date.now()): Espera[] {
  const salida: Espera[] = [];
  for (const c of lista) {
    if (!c.espera || !estaEsperando(c, ahora)) continue;
    salida.push({
      id: c.id,
      nombre: c.contact.name,
      desde: c.espera.desde,
      minutos: minutosDeEspera(c.espera.desde, ahora),
    });
  }
  return salida.sort((a, b) => Date.parse(a.desde) - Date.parse(b.desde));
}

/**
 * Una espera se reconoce por su conversación y desde cuándo espera: si el
 * equipo contesta y el cliente vuelve a escribir, es otra espera y vuelve a
 * avisar.
 */
export function claveDeEspera(e: Pick<Espera, "id" | "desde">): string {
  return `${e.id}@${e.desde}`;
}

/** Las que pasaron del umbral y todavía no se le avisaron a esta persona. */
export function nuevasParaAvisar(
  esperas: readonly Espera[],
  avisadas: { has(clave: string): boolean },
  umbral = UMBRAL_AVISO_MIN
): Espera[] {
  return esperas.filter((e) => e.minutos >= umbral && !avisadas.has(claveDeEspera(e)));
}

/** «Ana lleva 16 min esperando a una persona» o «3 clientes llevan más de 15 min…». */
export function textoAviso(nuevas: readonly Espera[], umbral = UMBRAL_AVISO_MIN): string {
  if (nuevas.length === 1) {
    const e = nuevas[0]!;
    return `${e.nombre} lleva ${textoMinutos(e.minutos)} esperando a una persona`;
  }
  return `${nuevas.length} clientes llevan más de ${umbral} min esperando a una persona`;
}

/* ---- Lo que ya se le avisó a cada persona, en este navegador ---- */

const CLAVE_AVISADAS = "vocero.esperando.avisadas";
/** Lo avisado hace más de 8 días ya no puede volver (la ventana más larga es de 7). */
const VIDA_AVISADA_MS = 8 * 24 * 3_600_000;

export function leerAvisadas(userId: string, ahora: number = Date.now()): Map<string, number> {
  try {
    const crudo = JSON.parse(
      window.localStorage.getItem(`${CLAVE_AVISADAS}.${userId}`) ?? "{}"
    ) as Record<string, unknown>;
    const avisadas = new Map<string, number>();
    for (const [k, v] of Object.entries(crudo)) {
      if (typeof v === "number" && ahora - v < VIDA_AVISADA_MS) avisadas.set(k, v);
    }
    return avisadas;
  } catch {
    return new Map();
  }
}

export function guardarAvisadas(userId: string, avisadas: Map<string, number>): void {
  try {
    window.localStorage.setItem(
      `${CLAVE_AVISADAS}.${userId}`,
      JSON.stringify(Object.fromEntries(avisadas))
    );
  } catch {
    // Sin almacenamiento el aviso puede repetirse al recargar; nada se rompe.
  }
}

/* ---- Qué ve cada persona (D7): cintillo y aviso, solo el aviso, o nada ---- */

export const MODOS_ESPERANDO = ["todo", "solo_aviso", "nada"] as const;
export type ModoEsperando = (typeof MODOS_ESPERANDO)[number];

export const ETIQUETA_MODO_ESPERANDO: Record<ModoEsperando, { titulo: string; cuando: string }> = {
  todo: {
    titulo: "Cintillo y aviso a los 15 min",
    cuando:
      "Arriba de cualquier pantalla ves cuántos clientes esperan, y te avisamos cuando uno pasa de 15 minutos.",
  },
  solo_aviso: {
    titulo: "Solo el aviso de los 15 min",
    cuando: "Sin cintillo: solo te avisamos cuando un cliente pasa de 15 minutos esperando.",
  },
  nada: {
    titulo: "Nada",
    cuando: "Ni cintillo ni aviso. Quién espera sigue en la pestaña «Esperando» de la Bandeja.",
  },
};

/** Lo que eligió UNA persona para «Esperando». */
export type AvisoEsperandoDto = { modo: ModoEsperando; sonido: boolean };

/** Lo de siempre: cintillo y aviso, con sonido. */
export const AVISO_ESPERANDO_POR_DEFECTO: AvisoEsperandoDto = { modo: "todo", sonido: true };

/**
 * Se guarda en una cookie de la persona, como su apariencia (062): sin tabla
 * ni migración, y el layout la lee en el servidor para que el primer pintado
 * ya la sepa.
 */
export const ESPERANDO_COOKIE = "vocero-esperando";
/** Un año, como la apariencia. */
export const ESPERANDO_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Lee la cookie. Nunca lanza: una cookie vacía o manipulada es lo de siempre. */
export function avisoEsperandoDeCookie(valor: string | null | undefined): AvisoEsperandoDto {
  if (!valor) return AVISO_ESPERANDO_POR_DEFECTO;
  // El valor solo lleva letras, «_», un punto y un dígito: no se decodifica.
  const [modo, sonido] = valor.split(".");
  return {
    modo: (MODOS_ESPERANDO as readonly string[]).includes(modo ?? "")
      ? (modo as ModoEsperando)
      : AVISO_ESPERANDO_POR_DEFECTO.modo,
    sonido: sonido !== "0",
  };
}

/** El valor de la cookie: «todo.1», «solo_aviso.0»… */
export function cookieDeAvisoEsperando(a: AvisoEsperandoDto): string {
  return `${a.modo}.${a.sonido ? "1" : "0"}`;
}

/* ---- Puentes entre el cintillo, el aviso y la Bandeja ---- */

/** El cintillo o el aviso piden abrir la pestaña «Esperando». */
export const EVENTO_VER_ESPERANDO = "vocero:ver-esperando";
/** La ruta de la pestaña: la Bandeja la abre al leer `vista=esperando`. */
export const URL_ESPERANDO = "/inbox?vista=esperando";
/** Donde cada persona elige qué ve de «Esperando». */
export const URL_AJUSTE_ESPERANDO = "/settings/appearance#esperando";

export function pedirVerEsperando(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO_VER_ESPERANDO));
}
