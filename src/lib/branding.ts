import { DEFAULT_CURRENCY, isCurrency, type Currency } from "@/lib/money";

/**
 * White-label: nombre del CRM, acento y moneda por organización.
 * Presets sobrios del sistema Atlas; para un color personalizado se derivan
 * hover/soft/tint/text y la tinta encima (blanca o casi negra) pasa AA.
 */

export type AccentSet = {
  accent: string;
  hover: string;
  soft: string;
  tint: string;
  text: string;
  /** Tinta legible ENCIMA del acento (botones, badges). */
  fg: string;
};

/** El acento se deriva distinto según el tema activo. */
export type ThemeMode = "light" | "dark";

/**
 * Icono subido. Solo el tipo y una versión: el binario vive en el volumen de
 * medios, porque `organization.metadata` se lee en CADA render de página y
 * meter ahí un archivo en base64 haría pagar ese peso en todas.
 */
export type BrandingFavicon = {
  mime: string;
  /**
   * Marca de tiempo de la carga. Es lo que hace que el navegador suelte el
   * icono anterior. No es un contador a propósito: al quitar el icono no queda
   * dónde recordar por cuál íbamos, y reiniciar en 1 repetiría una URL ya
   * cacheada con OTRO logo dentro.
   */
  version: number;
};

export type Branding = {
  name: string;
  accent: string; // hex del acento base elegido
  /** Moneda del negocio: la única que el tablero suma. */
  currency: Currency;
  /** `null` = se dibuja con la inicial sobre el acento (ver `lib/favicon`). */
  favicon: BrandingFavicon | null;
};

export const DEFAULT_BRANDING: Branding = {
  name: "Vocero",
  // El azul eléctrico de vocerocrm.com: la instancia recién instalada se ve
  // igual que la landing. Una agencia lo cambia en Configuración → Marca.
  accent: "#0d5bff",
  currency: DEFAULT_CURRENCY,
  favicon: null,
};

/**
 * Presets. El primero es la marca Vocero (valores exactos de la landing); los
 * demás son los tonos sobrios del handoff Atlas, que siguen disponibles para
 * quien quiera un CRM más discreto.
 */
export const ACCENT_PRESETS: Record<string, { label: string; set: AccentSet }> = {
  "#0d5bff": {
    label: "Azul Vocero",
    set: { accent: "#0d5bff", hover: "#0a4de6", soft: "#d3e2ff", tint: "#ebf1ff", text: "#0038d8", fg: "#ffffff" },
  },
  "#3f5972": {
    label: "Azul acero",
    set: { accent: "#3f5972", hover: "#334a60", soft: "#dde5ee", tint: "#f3f6f9", text: "#2b4056", fg: "#ffffff" },
  },
  "#4b5563": {
    label: "Grafito",
    set: { accent: "#4b5563", hover: "#3b4350", soft: "#e2e5ea", tint: "#f4f5f7", text: "#333a45", fg: "#ffffff" },
  },
  "#3f6b66": {
    label: "Verde apagado",
    set: { accent: "#3f6b66", hover: "#335752", soft: "#dcebe8", tint: "#f2f8f6", text: "#2b4a46", fg: "#ffffff" },
  },
  "#5f5470": {
    label: "Ciruela",
    set: { accent: "#5f5470", hover: "#4d4459", soft: "#e6e1ec", tint: "#f6f4f8", text: "#443c52", fg: "#ffffff" },
  },
};

type Rgb = { r: number; g: number; b: number };

export function isValidHex(hex: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(hex);
}

function hexToRgb(hex: string): Rgb {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function rgbToHex({ r, g, b }: Rgb): string {
  const c = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Mezcla `color` hacia `target` en proporción t (0..1). */
function mix(color: Rgb, target: Rgb, t: number): Rgb {
  return {
    r: color.r + (target.r - color.r) * t,
    g: color.g + (target.g - color.g) * t,
    b: color.b + (target.b - color.b) * t,
  };
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const BLACK: Rgb = { r: 0, g: 0, b: 0 };

/** Luminancia relativa (WCAG). */
function luminance({ r, g, b }: Rgb): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Contraste WCAG entre dos colores. */
function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

/** Fondo de referencia del tema oscuro (debe seguir a `--bg` de globals.css). */
const DARK_BG: Rgb = { r: 0x1a, g: 0x23, b: 0x20 };

/**
 * Fondo de referencia de la barra lateral (debe seguir a `--bg` de `.nav-dark`).
 * La barra es azul marino fijo en los dos temas, así que su acento se calcula
 * contra ella y no contra la página: si siguiera a DARK_BG, cambiar el tema
 * oscuro repintaría también la barra del tema claro.
 */
const NAV_BG: Rgb = { r: 0x0b, g: 0x13, b: 0x27 };

/** Tinta ENCIMA del acento: blanco solo si pasa AA (4.5:1), si no, casi negro. */
const INK_ON_LIGHT = "#0f1419";
const INK: Rgb = hexToRgb(INK_ON_LIGHT);
function inkOn(base: Rgb): string {
  return contrast(base, WHITE) >= 4.5 ? "#ffffff" : INK_ON_LIGHT;
}
/**
 * ¿Alguna de las dos tintas pasa AA? En los tonos medios (blanco entre 4.1 y
 * 4.5:1) ninguna llega, así que el relleno se sigue moviendo: se aclara en
 * oscuro (hasta que la tinta casi negra pase) y se oscurece en claro.
 */
function inkPasses(base: Rgb): boolean {
  return contrast(base, WHITE) >= 4.5 || contrast(base, INK) >= 4.5;
}

/**
 * Receta de un acento sobre fondo oscuro. `minContrast` es el del relleno
 * contra el fondo (botón, barra de selección: 3:1 basta para lo que no es
 * texto; el acento como TEXTO usa `text`, ver --accent-ink); `soft`/`tint`
 * son cuánto se hunden hacia el fondo, y `text` cuánto se aclara la tinta,
 * que además se sube hasta 4.5:1 sobre el tint.
 */
type DarkRecipe = { bg: Rgb; minContrast: number; soft: number; tint: number; text: number };

// Página oscura: con 3:1 el azul Vocero conserva la tinta blanca (4.5:1); el
// tint más denso (0.78) hace que la fila seleccionada se vea sin leer el color
// del texto (≥ 1.25:1 contra el fondo).
const PAGE_DARK: DarkRecipe = { bg: DARK_BG, minContrast: 3, soft: 0.56, tint: 0.72, text: 0.34 };
// Barra lateral: la receta de siempre, para que se vea igual que antes.
const NAV_DARK: DarkRecipe = { bg: NAV_BG, minContrast: 3.5, soft: 0.72, tint: 0.88, text: 0.28 };

function darkAccentSet(accentHex: string, r: DarkRecipe): AccentSet {
  let base = hexToRgb(
    isValidHex(accentHex) ? accentHex.toLowerCase() : DEFAULT_BRANDING.accent
  );
  while (
    (contrast(base, r.bg) < r.minContrast || !inkPasses(base)) &&
    luminance(base) < 0.95
  ) {
    base = mix(base, WHITE, 0.1);
  }
  const tint = mix(base, r.bg, r.tint);
  let text = mix(base, WHITE, r.text);
  while (contrast(text, tint) < 4.5 && luminance(text) < 0.95) {
    text = mix(text, WHITE, 0.1);
  }
  return {
    accent: rgbToHex(base),
    hover: rgbToHex(mix(base, WHITE, 0.16)),
    soft: rgbToHex(mix(base, r.bg, r.soft)),
    tint: rgbToHex(tint),
    text: rgbToHex(text),
    fg: inkOn(base),
  };
}

/**
 * Set completo para cualquier acento, según el tema.
 *
 * Claro: preset exacto si existe; si no se deriva mezclando hacia blanco, y un
 * base demasiado claro se oscurece hasta contraste ≥ 3:1 con el fondo blanco.
 * La tinta encima es blanca solo si pasa AA; en un acento claro (un verde, un
 * amarillo) va casi negra.
 *
 * Oscuro: los presets NO aplican — un acento pensado para fondo blanco se
 * hunde en el fondo oscuro. Se aclara hasta despegarse del fondo y las
 * variantes soft/tint se mezclan hacia el fondo oscuro, no hacia blanco.
 */
export function resolveAccentSet(
  accentHex: string,
  mode: ThemeMode = "light"
): AccentSet {
  if (mode === "dark") return darkAccentSet(accentHex, PAGE_DARK);

  const preset = ACCENT_PRESETS[accentHex.toLowerCase()];
  if (preset) return preset.set;
  if (!isValidHex(accentHex)) return ACCENT_PRESETS[DEFAULT_BRANDING.accent]!.set;

  let base = hexToRgb(accentHex.toLowerCase());
  // contraste con blanco = (1.05) / (L + 0.05); exigir ≥ 3
  while (1.05 / (luminance(base) + 0.05) < 3 && luminance(base) > 0.005) {
    base = mix(base, BLACK, 0.12);
  }
  while (!inkPasses(base) && luminance(base) > 0.005) {
    base = mix(base, BLACK, 0.12);
  }
  return {
    accent: rgbToHex(base),
    hover: rgbToHex(mix(base, BLACK, 0.16)),
    soft: rgbToHex(mix(base, WHITE, 0.82)),
    tint: rgbToHex(mix(base, WHITE, 0.94)),
    text: rgbToHex(mix(base, BLACK, 0.28)),
    fg: inkOn(base),
  };
}

/** El acento de la barra lateral azul marino (`.nav-dark`), en cualquier tema. */
export function resolveNavAccentSet(accentHex: string): AccentSet {
  return darkAccentSet(accentHex, NAV_DARK);
}

function accentBlock(selector: string, s: AccentSet): string {
  return `${selector}{--accent:${s.accent};--accent-hover:${s.hover};--accent-soft:${s.soft};--accent-tint:${s.tint};--accent-text:${s.text};--accent-fg:${s.fg};}`;
}

/**
 * CSS de variables para inyectar en el <head> (SSR, sin flash). Emite los DOS
 * temas aunque el servidor ya sepa cuál está activo: el botón de tema cambia
 * `data-theme` en el cliente sin recargar, así que el CSS del otro tema tiene
 * que estar presente desde el primer pintado.
 *
 * El selector va duplicado (`:root:root`) a propósito: así gana en
 * especificidad a los bloques de globals.css sin depender del orden de carga.
 *
 * El tercer bloque (`.nav-dark`) es el sidebar: azul marino sin importar
 * `data-theme`, así que su acento se calcula SIEMPRE contra su propio fondo
 * (`NAV_BG`, ver `resolveNavAccentSet`), no con el que esté activo en el resto
 * de la página. Al declararse directamente sobre el `<aside>` (no sobre
 * `:root`), gana para ese elemento y sus hijos sin competir en especificidad
 * con los otros dos bloques, que solo tocan `<html>`.
 */
export function accentCssVariables(accentHex: string): string {
  return (
    accentBlock(":root:root", resolveAccentSet(accentHex, "light")) +
    accentBlock(
      ':root:root[data-theme="dark"]',
      resolveAccentSet(accentHex, "dark")
    ) +
    accentBlock(".nav-dark", resolveNavAccentSet(accentHex))
  );
}

export function normalizeBranding(input: Partial<Branding> | null): Branding {
  const name = input?.name?.trim().slice(0, 30) || DEFAULT_BRANDING.name;
  const accent =
    input?.accent && isValidHex(input.accent)
      ? input.accent.toLowerCase()
      : DEFAULT_BRANDING.accent;
  const currency = isCurrency(input?.currency)
    ? input.currency
    : DEFAULT_BRANDING.currency;
  // El icono no se toca desde el formulario de marca: se sube y se quita por
  // su propia ruta. Un PUT de nombre/color no debe borrarlo de rebote.
  const f = input?.favicon;
  const favicon =
    f && typeof f.mime === "string" && Number.isFinite(f.version)
      ? { mime: f.mime, version: Math.max(1, Math.floor(f.version)) }
      : null;
  return { name, accent, currency, favicon };
}
