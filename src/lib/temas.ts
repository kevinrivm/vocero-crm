/**
 * 062 — Ajustes → Apariencia: los temas listos, el tema propio, la letra, el
 * tamaño y la densidad. Puro: lo usan el layout raíz (para pintar sin
 * parpadeo), la pantalla de Apariencia y las pruebas de contraste.
 *
 * Un tema es un mapa de tokens que pisa a los de `globals.css`. Menta (claro)
 * y Noche (oscuro) SON los de `globals.css` (061), así que no traen tokens: el
 * resto se inyecta como bloques `:root:root[data-tema="…"]` (ver `cssDeTemas`).
 * El acento no lo toca ningún tema: es de la marca (white-label).
 */
import { z } from "zod";

export type Modo = "light" | "dark";

export const TEMA_IDS = [
  "menta",
  "noche",
  "vocero",
  "vocero-oscuro",
  "papel",
  "carbon",
  "medianoche",
  "alto-contraste",
] as const;
export type TemaId = (typeof TEMA_IDS)[number];

export type Tema = {
  nombre: string;
  descripcion: string;
  modo: Modo;
  /** Al que salta el botón de sol y luna. */
  pareja: TemaId;
  /** Tokens que pisan a los de `globals.css` (vacío = la base de su modo). */
  tokens: Record<string, string>;
};

export const TEMAS: Record<TemaId, Tema> = {
  menta: {
    nombre: "Menta",
    descripcion: "Tarjetas blancas sobre menta suave. El de siempre.",
    modo: "light",
    pareja: "noche",
    tokens: {},
  },
  noche: {
    nombre: "Noche",
    descripcion: "La pareja oscura de Menta.",
    modo: "dark",
    pareja: "menta",
    tokens: {},
  },
  vocero: {
    nombre: "Vocero",
    descripcion: "El azul papel frío de la 2.x.",
    modo: "light",
    pareja: "vocero-oscuro",
    tokens: {
      "--bg": "#ffffff",
      "--bg-subtle": "#f6f8fc",
      "--bg-panel": "#eef2f9",
      "--bg-hover": "#e9eef8",
      "--bg-raised": "#ffffff",
      "--text": "#0a1730",
      "--text-2": "#42506b",
      "--text-3": "#56637d",
      "--text-4": "#7f8ca6",
      "--border": "#e3e9f3",
      "--border-strong": "#d3dcec",
      "--chip-bg": "#ffffff",
      "--row-hover": "#f6f8fc",
      "--cal-off": "#f6f8fc",
      "--chat-bg": "#f6f8fc",
      "--bubble-in": "#eaf7ef",
      "--bubble-in-border": "#b5dcc4",
      "--bubble-in-text": "#0a1730",
      "--bubble-in-muted": "#4a5873",
      "--bubble-in-link": "#0038d8",
      "--bubble-in-raised": "#ffffff",
      "--bubble-in-line": "#cfe9d8",
      "--bubble-out": "#ebf1ff",
      "--bubble-out-border": "#cdddfb",
      "--bubble-out-text": "#0a1730",
      "--bubble-out-muted": "#4a5873",
      "--bg-active": "#ebf1ff",
      "--marco-1": "#f3f6fb",
      "--marco-2": "#d6e1f3",
      "--riel-activo": "#0a1730",
      "--riel-activo-texto": "#ffffff",
      "--enviar": "#0a1730",
      "--enviar-texto": "#ffffff",
      "--radio-tarjeta": "20px",
    },
  },
  "vocero-oscuro": {
    nombre: "Vocero oscuro",
    descripcion: "El azul marino de la 2.x.",
    modo: "dark",
    pareja: "vocero",
    tokens: {
      "--bg-subtle": "#141c30",
      "--bg": "#1c263c",
      "--row-hover": "#212c45",
      "--bg-raised": "#222d47",
      "--chip-bg": "#26334d",
      "--bg-panel": "#2c3a57",
      "--bg-hover": "#2f3d5e",
      "--cal-off": "#141c30",
      "--text": "#e8eefc",
      "--text-2": "#bac6e3",
      "--text-3": "#a3b1d0",
      "--text-4": "#7888ad",
      "--border": "#3a4c76",
      "--border-strong": "#4f6396",
      "--chat-bg": "#141c30",
      "--bubble-in": "#173d2c",
      "--bubble-in-border": "#2a5e45",
      "--bubble-in-text": "#e8eefc",
      "--bubble-in-muted": "#a9c9b8",
      "--bubble-in-link": "#8fc0ff",
      "--bubble-in-raised": "#1f4a36",
      "--bubble-in-line": "#2a5e45",
      "--bubble-out": "#22305a",
      "--bubble-out-border": "#33467e",
      "--bubble-out-text": "#e8eefc",
      "--bubble-out-muted": "#b3c3e6",
      "--bg-active": "#25365f",
      "--marco-1": "#0a1124",
      "--marco-2": "#0e172d",
      "--riel-activo": "#e8eefc",
      "--riel-activo-texto": "#0b1327",
      "--enviar": "#e8eefc",
      "--enviar-texto": "#0b1327",
      "--radio-tarjeta": "20px",
    },
  },
  papel: {
    nombre: "Papel",
    descripcion: "Cálido: crema, tinta café y esquinas suaves.",
    modo: "light",
    pareja: "carbon",
    tokens: {
      "--bg": "#fffdf8",
      "--bg-subtle": "#f7f1e6",
      "--bg-panel": "#efe6d6",
      "--bg-hover": "#ebe1cf",
      "--bg-raised": "#fffdf8",
      "--text": "#2a1d12",
      "--text-2": "#5a4632",
      "--text-3": "#6a5643",
      "--text-4": "#9a8670",
      "--border": "#ece2d0",
      "--border-strong": "#dccfb7",
      "--chip-bg": "#fffdf8",
      "--row-hover": "#f7f1e6",
      "--cal-off": "#f7f1e6",
      "--chat-bg": "#f7f1e6",
      "--bubble-in": "#2a1d12",
      "--bubble-in-border": "#2a1d12",
      "--bubble-in-text": "#fbf6ec",
      "--bubble-in-muted": "#c9b9a4",
      "--bubble-in-link": "#ffd27a",
      "--bubble-in-raised": "#3a2c1f",
      "--bubble-in-line": "#4d3d2d",
      "--bubble-out": "#fffdf8",
      "--bubble-out-border": "#e0d2ba",
      "--bubble-out-text": "#2a1d12",
      "--bubble-out-muted": "#6a5643",
      "--bg-active": "#f1e6d2",
      "--marco-1": "#f5ead8",
      "--marco-2": "#e3cfab",
      "--riel-activo": "#2a1d12",
      "--riel-activo-texto": "#fffdf8",
      "--enviar": "#2a1d12",
      "--enviar-texto": "#fffdf8",
      "--radio-tarjeta": "26px",
    },
  },
  carbon: {
    nombre: "Carbón",
    descripcion: "La pareja oscura de Papel: negro cálido.",
    modo: "dark",
    pareja: "papel",
    tokens: {
      "--bg-subtle": "#15120f",
      "--bg": "#1f1a16",
      "--row-hover": "#25201b",
      "--bg-raised": "#28231d",
      "--chip-bg": "#2d2721",
      "--bg-panel": "#342d26",
      "--bg-hover": "#3b332b",
      "--cal-off": "#15120f",
      "--text": "#f3ece2",
      "--text-2": "#d0c3b2",
      "--text-3": "#b7a998",
      "--text-4": "#908170",
      "--border": "#4a4036",
      "--border-strong": "#5f5346",
      "--chat-bg": "#15120f",
      "--bubble-in": "#efe6d8",
      "--bubble-in-border": "#efe6d8",
      "--bubble-in-text": "#1f1a16",
      "--bubble-in-muted": "#5b4e41",
      "--bubble-in-link": "#8a4b00",
      "--bubble-in-raised": "#ddd2c1",
      "--bubble-in-line": "#c9bba7",
      "--bubble-out": "#2b251f",
      "--bubble-out-border": "#4a4036",
      "--bubble-out-text": "#f3ece2",
      "--bubble-out-muted": "#bfb19f",
      "--bg-active": "#3a3027",
      "--marco-1": "#070605",
      "--marco-2": "#090807",
      "--riel-activo": "#efe6d8",
      "--riel-activo-texto": "#1f1a16",
      "--enviar": "#efe6d8",
      "--enviar-texto": "#1f1a16",
      "--radio-tarjeta": "26px",
    },
  },
  medianoche: {
    nombre: "Medianoche",
    descripcion: "Casi negro y nítido, al estilo Linear.",
    modo: "dark",
    pareja: "menta",
    tokens: {
      "--bg-subtle": "#0a0b0d",
      "--bg": "#16171c",
      "--row-hover": "#1b1c22",
      "--bg-raised": "#1e1f25",
      "--chip-bg": "#22232a",
      "--bg-panel": "#282a31",
      "--bg-hover": "#2f3139",
      "--cal-off": "#0a0b0d",
      "--text": "#ededef",
      "--text-2": "#b9bac2",
      "--text-3": "#a3a4b1",
      "--text-4": "#727383",
      "--border": "#3c3e4a",
      "--border-strong": "#555764",
      "--chat-bg": "#0a0b0d",
      "--bubble-in": "#ececef",
      "--bubble-in-border": "#ececef",
      "--bubble-in-text": "#121317",
      "--bubble-in-muted": "#545565",
      "--bubble-in-link": "#2f4fc2",
      "--bubble-in-raised": "#dadae0",
      "--bubble-in-line": "#c4c5cd",
      "--bubble-out": "#202128",
      "--bubble-out-border": "#33353e",
      "--bubble-out-text": "#ededef",
      "--bubble-out-muted": "#a7a8b5",
      "--bg-active": "#24263a",
      "--marco-1": "#000000",
      "--marco-2": "#000000",
      "--riel-activo": "#ededef",
      "--riel-activo-texto": "#121317",
      "--enviar": "#ededef",
      "--enviar-texto": "#121317",
      "--radio-tarjeta": "14px",
    },
  },
  "alto-contraste": {
    nombre: "Alto contraste",
    descripcion: "Blanco y negro, bordes marcados. Para ver mejor.",
    modo: "light",
    pareja: "medianoche",
    tokens: {
      "--bg": "#ffffff",
      "--bg-subtle": "#f2f2f2",
      "--bg-panel": "#e6e6e6",
      "--bg-hover": "#dcdcdc",
      "--bg-raised": "#ffffff",
      "--text": "#000000",
      "--text-2": "#1a1a1a",
      "--text-3": "#333333",
      "--text-4": "#595959",
      "--border": "#767676",
      "--border-strong": "#000000",
      "--chip-bg": "#ffffff",
      "--row-hover": "#f2f2f2",
      "--cal-off": "#f2f2f2",
      "--chat-bg": "#f2f2f2",
      "--bubble-in": "#000000",
      "--bubble-in-border": "#000000",
      "--bubble-in-text": "#ffffff",
      "--bubble-in-muted": "#e0e0e0",
      "--bubble-in-link": "#a8d4ff",
      "--bubble-in-raised": "#262626",
      "--bubble-in-line": "#808080",
      "--bubble-out": "#ffffff",
      "--bubble-out-border": "#000000",
      "--bubble-out-text": "#000000",
      "--bubble-out-muted": "#333333",
      "--bg-active": "#dedede",
      "--marco-1": "#ffffff",
      "--marco-2": "#d4d4d4",
      "--riel-activo": "#000000",
      "--riel-activo-texto": "#ffffff",
      "--enviar": "#000000",
      "--enviar-texto": "#ffffff",
      "--sombra-tarjeta": "0 0 0 1.5px #000000",
      "--radio-tarjeta": "12px",
    },
  },
};

export const LETRAS = {
  urbanist: { nombre: "Urbanist", variable: "--font-urbanist" },
  archivo: { nombre: "Archivo", variable: "--font-archivo" },
  inter: { nombre: "Inter", variable: "--font-inter" },
  plex: { nombre: "IBM Plex Sans", variable: "--font-plex-sans" },
} as const;
export type LetraId = keyof typeof LETRAS;

export const TAMANOS = {
  chico: { nombre: "Chico", escala: 0.93 },
  normal: { nombre: "Normal", escala: 1 },
  grande: { nombre: "Grande", escala: 1.1 },
} as const;
export type TamanoId = keyof typeof TAMANOS;

export const DENSIDADES = {
  compacta: { nombre: "Compacta", fila: "7px", hueco: "8px" },
  normal: { nombre: "Normal", fila: "11px", hueco: "12px" },
  espaciosa: { nombre: "Espaciosa", fila: "15px", hueco: "16px" },
} as const;
export type DensidadId = keyof typeof DENSIDADES;

const hex = z.string().regex(/^#[0-9a-f]{6}$/i);

export const aparienciaSchema = z.object({
  tema: z.enum([...TEMA_IDS, "propio"]),
  propio: z.object({ fondo: hex, texto: hex, marco: hex }).optional(),
  letra: z.enum(Object.keys(LETRAS) as [LetraId, ...LetraId[]]),
  tamano: z.enum(Object.keys(TAMANOS) as [TamanoId, ...TamanoId[]]),
  densidad: z.enum(Object.keys(DENSIDADES) as [DensidadId, ...DensidadId[]]),
});
export type Apariencia = z.infer<typeof aparienciaSchema>;

export const APARIENCIA_POR_DEFECTO: Apariencia = {
  tema: "menta",
  letra: "urbanist",
  tamano: "normal",
  densidad: "normal",
};

/** Cookie con la elección de esta persona en este equipo (D5). */
export const APARIENCIA_COOKIE = "vocero-apariencia";

/**
 * Lo que vale: la cookie de la persona si es válida; si no, el del negocio;
 * si no, el de Vocero. Nunca lanza: una cookie manipulada cae al siguiente.
 */
export function resolverApariencia(
  cookie: string | null | undefined,
  delNegocio: unknown
): { apariencia: Apariencia; propia: boolean } {
  const negocio = aparienciaSchema.safeParse(delNegocio);
  const base = negocio.success ? negocio.data : APARIENCIA_POR_DEFECTO;
  if (cookie) {
    try {
      const propia = aparienciaSchema.safeParse(JSON.parse(decodeURIComponent(cookie)));
      if (propia.success && (propia.data.tema !== "propio" || temaPropio(propia.data.propio).ok)) {
        return { apariencia: propia.data, propia: true };
      }
    } catch {
      // cookie ilegible: se ignora
    }
  }
  return { apariencia: base, propia: false };
}

/** El modo (claro u oscuro) que pinta una apariencia. */
export function modoDe(a: Apariencia): Modo {
  if (a.tema === "propio") {
    const t = temaPropio(a.propio);
    return t.ok ? t.modo : "light";
  }
  return TEMAS[a.tema].modo;
}

/** Al que salta el botón de sol y luna (D5). */
export function parejaDe(a: Apariencia): Apariencia {
  if (a.tema === "propio") return { ...a, tema: modoDe(a) === "dark" ? "menta" : "noche", propio: undefined };
  return { ...a, tema: TEMAS[a.tema].pareja };
}

// ---------- color ----------

type Rgb = [number, number, number];
const aRgb = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
const aHex = (c: Rgb) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;
/** Mezcla `a` hacia `b` en la proporción `t` (0 = a, 1 = b). */
export function mezclar(a: string, b: string, t: number): string {
  const [x, y] = [aRgb(a), aRgb(b)];
  return aHex([0, 1, 2].map((i) => x[i]! + (y[i]! - x[i]!) * t) as Rgb);
}
export function luminancia(h: string): number {
  const c = aRgb(h).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}
export function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Acerca `texto` a `fondo` lo más posible sin bajar de `min` de contraste. */
function suavizar(texto: string, fondos: string[], min: number, hasta: number): string {
  let mejor = texto;
  for (let t = 0.02; t <= hasta; t += 0.02) {
    const c = mezclar(texto, fondos[0]!, t);
    if (fondos.every((f) => contraste(c, f) >= min)) mejor = c;
    else break;
  }
  return mejor;
}

/**
 * D2 — El tema propio sale de tres colores: fondo (las tarjetas), texto y
 * marco. Los demás tonos se mezclan de esos tres, como en Linear. Si el texto
 * no se lee sobre el fondo, no hay tema: se dice por qué.
 */
export function temaPropio(
  c: { fondo: string; texto: string; marco: string } | undefined
): { ok: true; modo: Modo; tokens: Record<string, string> } | { ok: false; error: string } {
  if (!c) return { ok: false, error: "Elige los tres colores." };
  const { fondo, texto, marco } = c;
  if (contraste(texto, fondo) < 7) {
    return {
      ok: false,
      error: `El texto casi no se lee sobre el fondo (${contraste(texto, fondo).toFixed(1)}:1; hace falta 7:1).`,
    };
  }
  const modo: Modo = luminancia(fondo) < luminancia(texto) ? "dark" : "light";
  const hacia = modo === "dark" ? "#ffffff" : "#000000";
  const subtle = mezclar(fondo, marco, 0.3);
  const panel = mezclar(fondo, hacia, modo === "dark" ? 0.1 : 0.07);
  const hover = mezclar(fondo, hacia, modo === "dark" ? 0.14 : 0.1);
  const superficies = [fondo, subtle, panel, hover];
  const texto2 = suavizar(texto, superficies, 7, 0.4);
  const texto3 = suavizar(texto, superficies, 4.6, 0.6);
  if (superficies.some((s) => contraste(texto3, s) < 4.5)) {
    return { ok: false, error: "Con ese marco, los textos secundarios no se leen. Prueba un marco más cercano al fondo." };
  }
  const tokens: Record<string, string> = {
    "--bg": fondo,
    "--bg-raised": modo === "dark" ? mezclar(fondo, "#ffffff", 0.04) : fondo,
    "--bg-subtle": subtle,
    "--bg-panel": panel,
    "--bg-hover": hover,
    "--chip-bg": modo === "dark" ? mezclar(fondo, "#ffffff", 0.06) : fondo,
    "--row-hover": mezclar(fondo, marco, 0.18),
    "--cal-off": subtle,
    "--chat-bg": subtle,
    "--text": texto,
    "--text-2": texto2,
    "--text-3": texto3,
    "--text-4": mezclar(texto, fondo, 0.5),
    "--border": mezclar(fondo, texto, modo === "dark" ? 0.18 : 0.1),
    "--border-strong": mezclar(fondo, texto, modo === "dark" ? 0.3 : 0.18),
    "--bubble-in": texto,
    "--bubble-in-border": texto,
    "--bubble-in-text": fondo,
    "--bubble-in-muted": suavizar(fondo, [texto], 4.6, 0.5),
    "--bubble-in-link": suavizar(fondo, [texto], 4.6, 0.3),
    "--bubble-in-raised": mezclar(texto, fondo, 0.1),
    "--bubble-in-line": mezclar(texto, fondo, 0.3),
    "--bubble-out": fondo,
    "--bubble-out-border": mezclar(fondo, texto, 0.16),
    "--bubble-out-text": texto,
    "--bubble-out-muted": texto3,
    "--bg-active": mezclar(fondo, marco, 0.4),
    "--marco-1": mezclar(marco, fondo, 0.45),
    "--marco-2": marco,
    "--riel-activo": texto,
    "--riel-activo-texto": fondo,
    "--enviar": texto,
    "--enviar-texto": fondo,
  };
  return { ok: true, modo, tokens };
}

/** Las declaraciones de un mapa de tokens. */
function declaraciones(tokens: Record<string, string>): string {
  return Object.entries(tokens)
    .map(([k, v]) => `${k}:${v};`)
    .join("");
}

/**
 * Los bloques CSS de los temas listos que no son la base. `:root:root` sube la
 * especificidad por encima de `:root[data-theme="dark"]` de globals.css.
 */
export function cssDeTemas(): string {
  return TEMA_IDS.filter((id) => Object.keys(TEMAS[id].tokens).length > 0)
    .map((id) => `:root:root[data-tema="${id}"]{${declaraciones(TEMAS[id].tokens)}}`)
    .join("");
}

/** Las variables en línea del tema propio (o nada si no aplica). */
export function cssDePropio(a: Apariencia): string {
  if (a.tema !== "propio") return "";
  const t = temaPropio(a.propio);
  return t.ok ? `:root:root[data-tema="propio"]{${declaraciones(t.tokens)}}` : "";
}

/** Los atributos de `<html>` para una apariencia (D6). */
export function atributosHtml(a: Apariencia): Record<string, string> {
  return {
    "data-theme": modoDe(a),
    "data-tema": a.tema,
    "data-letra": a.letra,
    "data-tamano": a.tamano,
    "data-densidad": a.densidad,
  };
}

/**
 * Los tokens base que usa la miniatura de un tema en Ajustes → Apariencia.
 * Copia de los de `globals.css` (Menta y Noche): una prueba vigila que no se
 * separen (tests/unit/temas.test.ts).
 */
export const TOKENS_MINIATURA = [
  "--marco-1",
  "--marco-2",
  "--bg",
  "--chat-bg",
  "--text",
  "--text-3",
  "--border",
  "--bubble-in",
  "--bubble-out",
  "--bubble-out-border",
  "--riel-activo",
  "--enviar",
] as const;
export const BASE_MINIATURA: Record<Modo, Record<(typeof TOKENS_MINIATURA)[number], string>> = {
  light: {
    "--marco-1": "#f1eee5",
    "--marco-2": "#cde1d5",
    "--bg": "#ffffff",
    "--chat-bg": "#eef4f0",
    "--text": "#141a17",
    "--text-3": "#5f6a65",
    "--border": "#e1e9e4",
    "--bubble-in": "#151b18",
    "--bubble-out": "#ffffff",
    "--bubble-out-border": "#d8e2dc",
    "--riel-activo": "#151b18",
    "--enviar": "#151b18",
  },
  dark: {
    "--marco-1": "#090d0b",
    "--marco-2": "#0d1210",
    "--bg": "#1a2320",
    "--chat-bg": "#121916",
    "--text": "#eaf1ed",
    "--text-3": "#a5b2ab",
    "--border": "#3d4e46",
    "--bubble-in": "#e6eee9",
    "--bubble-out": "#26312c",
    "--bubble-out-border": "#3b4a43",
    "--riel-activo": "#e6eee9",
    "--enviar": "#e6eee9",
  },
};

/** Los tokens de la miniatura de un tema (o del propio). */
export function tokensMiniatura(a: Pick<Apariencia, "tema" | "propio">): Record<string, string> {
  if (a.tema === "propio") {
    const t = temaPropio(a.propio);
    if (!t.ok) return BASE_MINIATURA.light;
    return { ...BASE_MINIATURA[t.modo], ...t.tokens };
  }
  const tema = TEMAS[a.tema];
  return { ...BASE_MINIATURA[tema.modo], ...tema.tokens };
}
