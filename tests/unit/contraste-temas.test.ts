import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACCENT_PRESETS,
  DEFAULT_BRANDING,
  resolveAccentSet,
  resolveNavAccentSet,
} from "@/lib/branding";

/**
 * R8 — Pisos de contraste de los dos temas, medidos sobre los tokens REALES de
 * globals.css (no sobre una copia). El tema oscuro de antes pasaba todas las
 * pruebas y aun así se veía plano: barra y página a 1.04:1, chip y panel a
 * 1.01:1. Aquí vive cada par que importa con su piso, para que un retoque de
 * color que lo rompa truene en `pnpm test` y no en una captura.
 *
 * Pisos: texto de lectura ≥ 4.5:1 (WCAG AA); iconos, rellenos y anillo de
 * foco ≥ 3:1 (1.4.11); y para superficies y bordes, el escalón mínimo que se
 * alcanza a ver (≈ 1.1–1.25:1 entre superficies, ≥ 1.4:1 un borde).
 */

type Vars = Record<string, string>;

function luminancia(hex: string): number {
  const ch = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

function contraste(a: string, b: string): number {
  const [l1, l2] = [luminancia(a), luminancia(b)];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** Variables de un bloque de globals.css, con el valor sin saltos de línea. */
function bloque(css: string, selector: string): Vars {
  const inicio = css.indexOf(selector);
  expect(inicio, `no está el bloque ${selector}`).toBeGreaterThanOrEqual(0);
  const cuerpo = css
    .slice(css.indexOf("{", inicio) + 1, css.indexOf("}", inicio))
    .replace(/\/\*[\s\S]*?\*\//g, ""); // un comentario puede nombrar un token
  return Object.fromEntries(
    [...cuerpo.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [
      m[1]!,
      m[2]!.replace(/\s+/g, " ").trim(),
    ])
  );
}

const css = readFileSync("src/app/globals.css", "utf8");
const claro = bloque(css, ":root {");
const oscuroCrudo = bloque(css, ':root[data-theme="dark"] {');
const nav = bloque(css, ".nav-dark {");

/** Tokens del tema oscuro: lo que el bloque no redeclara viene de `:root`. */
const oscuro: Vars = { ...claro, ...oscuroCrudo };

/** Resuelve `var(--x)` contra el mismo bloque (un nivel alcanza aquí). */
function hex(vars: Vars, nombre: string): string {
  const v = vars[nombre];
  expect(v, `falta ${nombre}`).toBeDefined();
  const ref = /^var\((--[\w-]+)\)$/.exec(v!)?.[1];
  const valor = ref ? vars[ref] : v;
  expect(valor, `${nombre} no es un hex`).toMatch(/^#[0-9a-f]{6}$/i);
  return valor!.toLowerCase();
}

/** Afirma un piso con un mensaje que dice el par y su valor. */
function piso(vars: Vars, a: string, b: string, min: number) {
  const c = contraste(hex(vars, a), hex(vars, b));
  expect(c, `${a} sobre ${b}: ${c.toFixed(2)} (piso ${min})`).toBeGreaterThanOrEqual(min);
}

/** `a` es la superficie MÁS CLARA de las dos. */
function arriba(vars: Vars, a: string, b: string) {
  expect(
    luminancia(hex(vars, a)),
    `${a} debería ir un escalón arriba de ${b}`
  ).toBeGreaterThan(luminancia(hex(vars, b)));
}

describe("061 — las tarjetas se despegan del marco", () => {
  // La barra azul marino (.nav-dark) ya no es el menú: en escritorio es el riel
  // de iconos, una tarjeta más. Lo que tiene que verse es la tarjeta contra el
  // marco que asoma entre ellas.
  it("en claro y en oscuro, la tarjeta y el marco no se confunden", () => {
    piso(claro, "--bg", "--marco-2", 1.1);
    piso(oscuro, "--bg", "--marco-2", 1.15);
    arriba(oscuro, "--bg", "--marco-2");
  });

  it("el riel activo y el botón de enviar se ven y su icono se lee", () => {
    for (const t of [claro, oscuro]) {
      piso(t, "--riel-activo", "--bg", 3);
      piso(t, "--riel-activo-texto", "--riel-activo", 4.5);
      piso(t, "--enviar", "--chat-bg", 3);
      piso(t, "--enviar-texto", "--enviar", 4.5);
    }
  });
});

describe("tema oscuro: escalera de superficies", () => {
  it("hueco < página < fila bajo el cursor ≈ lo que flota < chip < panel < hover", () => {
    arriba(oscuro, "--bg", "--bg-subtle");
    arriba(oscuro, "--row-hover", "--bg");
    arriba(oscuro, "--bg-raised", "--bg");
    arriba(oscuro, "--chip-bg", "--row-hover");
    arriba(oscuro, "--bg-panel", "--chip-bg");
    arriba(oscuro, "--bg-panel", "--bg-raised");
    arriba(oscuro, "--bg-hover", "--bg-panel");
  });

  it("cada escalón se ve", () => {
    piso(oscuro, "--bg", "--bg-subtle", 1.1);
    piso(oscuro, "--row-hover", "--bg", 1.07);
    piso(oscuro, "--bg-raised", "--bg", 1.08);
    // Un botón secundario (bg-secondary) dentro de un diálogo o un cajón.
    piso(oscuro, "--bg-panel", "--bg-raised", 1.1);
    piso(oscuro, "--bg-panel", "--bg", 1.2);
    piso(oscuro, "--chip-bg", "--bg", 1.15);
    piso(oscuro, "--chip-bg", "--row-hover", 1.07);
    piso(oscuro, "--bg-hover", "--bg", 1.35);
    // El contador dentro de un chip de filtro (bg-secondary sobre bg-chip):
    // antes 1.01:1, el círculo no se veía.
    piso(oscuro, "--bg-panel", "--chip-bg", 1.1);
    // Como en claro (1.03:1), el hover de un botón secundario es sutil.
    piso(oscuro, "--bg-hover", "--bg-panel", 1.05);
    piso(oscuro, "--bg-hover", "--bg-raised", 1.25);
    // 215 — el horario no hábil contra la rejilla (bg-card = --bg).
    piso(oscuro, "--bg", "--cal-off", 1.08);
  });

  it("los bordes separan (≥ 1.6:1 en la página, ≥ 1.4:1 en lo que flota)", () => {
    piso(oscuro, "--border", "--bg", 1.6);
    piso(oscuro, "--border", "--bg-subtle", 1.5);
    piso(oscuro, "--border", "--bg-raised", 1.4);
    piso(oscuro, "--border-strong", "--bg", 2.2);
    piso(oscuro, "--border-strong", "--bg-raised", 2);
  });

  it("las burbujas se despegan del hilo y lo de adentro se lee", () => {
    // 061 — Cada burbuja lleva su texto, su gris (hora, cita) y sus enlaces.
    for (const t of [claro, oscuro]) {
      piso(t, "--bubble-in", "--chat-bg", 1.3);
      piso(t, "--bubble-in-text", "--bubble-in", 7);
      piso(t, "--bubble-in-muted", "--bubble-in", 4.5);
      piso(t, "--bubble-in-link", "--bubble-in", 4.5);
      piso(t, "--bubble-in-text", "--bubble-in-raised", 7);
      piso(t, "--bubble-out-text", "--bubble-out", 7);
      piso(t, "--bubble-out-muted", "--bubble-out", 4.5);
      piso(t, "--bubble-out-border", "--chat-bg", 1.15);
    }
  });
});

describe("tema oscuro: texto", () => {
  const superficies = [
    "--bg-subtle",
    "--bg",
    "--row-hover",
    "--bg-raised",
    "--bg-panel",
    "--chip-bg",
    "--bg-hover",
    "--accent-tint",
  ];

  it("texto, secundario y terciario pasan AA sobre TODA superficie", () => {
    // `text-3` incluido: es el de la `.kicker` (10.5px) y de las horas.
    for (const s of superficies) {
      piso(oscuro, "--text", s, 7);
      piso(oscuro, "--text-2", s, 4.5);
      piso(oscuro, "--text-3", s, 4.5);
    }
  });

  it("text-4 alcanza para iconos (≥ 3:1), no para leer", () => {
    for (const s of ["--bg", "--bg-raised", "--bg-panel", "--accent-tint"]) {
      piso(oscuro, "--text-4", s, 3);
    }
  });

  it("las tríadas de estado se leen sobre su propio fondo", () => {
    for (const e of ["success", "warning", "danger", "info"]) {
      piso(oscuro, `--${e}-text`, `--${e}-tint`, 4.5);
      piso(oscuro, `--${e}-text`, "--bg", 4.5);
      arriba(oscuro, `--${e}-tint`, "--bg");
      piso(oscuro, `--${e}-soft`, `--${e}-tint`, 1.3);
    }
    piso(oscuro, "--danger-fg", "--danger", 4.5);
  });
});

describe("tema oscuro: acento", () => {
  const set = resolveAccentSet(DEFAULT_BRANDING.accent, "dark");

  it("el respaldo de globals.css es el que calcula lib/branding", () => {
    // Si alguien retoca la receta y no el respaldo (o al revés), el primer
    // pintado sin white-label sale de otro color que el resto.
    expect(hex(oscuro, "--accent")).toBe(set.accent);
    expect(hex(oscuro, "--accent-hover")).toBe(set.hover);
    expect(hex(oscuro, "--accent-soft")).toBe(set.soft);
    expect(hex(oscuro, "--accent-tint")).toBe(set.tint);
    expect(hex(oscuro, "--accent-text")).toBe(set.text);
    expect(hex(oscuro, "--accent-fg")).toBe(set.fg);
  });

  it("la fila seleccionada se ve sin leer el color del texto (tint ≥ 1.25:1)", () => {
    piso(oscuro, "--accent-tint", "--bg", 1.25);
    piso(oscuro, "--accent-soft", "--bg", 1.5);
  });

  it("el acento rellena (≥ 3:1) y su tinta se lee (≥ 4.5:1)", () => {
    piso(oscuro, "--accent", "--bg", 3);
    piso(oscuro, "--accent-fg", "--accent", 4.5);
    for (const s of ["--bg", "--bg-raised", "--accent-tint"]) {
      piso(oscuro, "--accent-ink", s, 4.5); // una hora, un enlace, «IA»
    }
  });

  it("el anillo de foco se ve donde hay algo enfocable (≥ 3:1)", () => {
    for (const s of ["--bg-subtle", "--bg", "--bg-raised", "--bg-panel", "--accent-tint"]) {
      piso(oscuro, "--ring", s, 3);
    }
  });
});

describe("tema claro: no cambia", () => {
  it("lo que flota, la tinta y el anillo del acento son los de siempre", () => {
    expect(claro["--bg-raised"]).toBe(claro["--bg"]);
    expect(claro["--accent-ink"]).toBe("var(--accent)");
    expect(claro["--ring"]).toBe("var(--accent)");
  });

  it("la barra (.nav-dark) conserva sus valores: se ve igual en los dos temas", () => {
    // Son los que tenía cuando copiaba al tema oscuro de antes; si la barra
    // cambia, cambia también en claro, que es el tema que al dueño le gusta.
    expect(nav).toMatchObject({
      "--bg": "#0b1327",
      "--bg-subtle": "#070e20",
      "--bg-panel": "#131f3d",
      "--bg-hover": "#182750",
      "--text": "#e8eefc",
      "--text-2": "#a9b8dc",
      "--text-3": "#7688b0",
      "--border": "#263866",
      "--border-strong": "#34498a",
      "--ring": "var(--accent)",
    });
    expect(css).toMatch(/\.nav-dark \{\s*color-scheme: dark;/);
  });

  it("dentro de la barra el texto se lee", () => {
    piso(nav, "--text", "--bg-subtle", 7);
    piso(nav, "--text-2", "--bg-hover", 4.5);
    piso(nav, "--text-3", "--bg-subtle", 4.5);
  });
});

describe("tinta sobre el acento: blanca solo si pasa AA (≥ 4.5:1)", () => {
  // Presets + colores que un negocio sí elige: un verde (antes 3.3:1 con
  // blanco), un amarillo, un rojo, un morado, un gris y un azul profundo.
  const acentos = [
    ...Object.keys(ACCENT_PRESETS),
    "#16a34a",
    "#f59e0b",
    "#e11d48",
    "#7c3aed",
    "#6b7280",
    "#12305a",
    "#ffee88",
  ];

  it("en los dos temas y en la barra", () => {
    for (const a of acentos) {
      for (const [donde, s] of [
        ["claro", resolveAccentSet(a, "light")],
        ["oscuro", resolveAccentSet(a, "dark")],
        ["barra", resolveNavAccentSet(a)],
      ] as const) {
        const c = contraste(s.fg, s.accent);
        expect(c, `${a} en ${donde}: ${c.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("un acento claro lleva tinta oscura en vez de oscurecerse más", () => {
    const verde = resolveAccentSet("#16a34a", "light");
    expect(verde.accent).toBe("#16a34a");
    expect(verde.fg).not.toBe("#ffffff");
  });

  it("en oscuro cada acento se despega de la página y su tinta se lee", () => {
    const pagina = hex(oscuro, "--bg");
    for (const a of acentos) {
      const s = resolveAccentSet(a, "dark");
      expect(contraste(s.accent, pagina), `${a}: relleno`).toBeGreaterThanOrEqual(3);
      expect(contraste(s.text, s.tint), `${a}: tinta sobre tint`).toBeGreaterThanOrEqual(4.5);
      expect(contraste(s.text, pagina), `${a}: tinta sobre la página`).toBeGreaterThanOrEqual(4.5);
      // El tono ayuda (un rojo se distingue del azul marino aunque su
      // luminancia se le acerque); el azul Vocero lleva su propio piso, 1.25.
      expect(contraste(s.tint, pagina), `${a}: tint`).toBeGreaterThanOrEqual(1.1);
    }
  });

  it("en la barra, el acento se calcula contra SU fondo (≥ 3.5:1)", () => {
    for (const a of acentos) {
      const s = resolveNavAccentSet(a);
      expect(contraste(s.accent, hex(nav, "--bg")), a).toBeGreaterThanOrEqual(3.5);
      expect(contraste(s.text, s.tint), `${a}: tinta sobre tint`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
