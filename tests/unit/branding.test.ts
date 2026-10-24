import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACCENT_PRESETS,
  accentCssVariables,
  DEFAULT_BRANDING,
  isValidHex,
  normalizeBranding,
  resolveAccentSet,
  resolveNavAccentSet,
} from "@/lib/branding";

const DARK_BG = "#1a2320";
const NAV_BG = "#0b1327";

/** Contraste WCAG entre dos hex, para afirmar sobre legibilidad y no sobre
 *  valores concretos: lo que importa es que se LEA, no que dé cierto color. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const ch = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
  };
  const [l1, l2] = [lum(a), lum(b)];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** Variables de un bloque de globals.css, con el valor sin saltos de línea. */
function variables(css: string, selector: string): Record<string, string> {
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

describe("white-label: acento", () => {
  it("preset devuelve el set exacto del handoff", () => {
    expect(resolveAccentSet("#3f5972")).toEqual(ACCENT_PRESETS["#3f5972"]!.set);
    expect(resolveAccentSet("#5f5470").soft).toBe("#e6e1ec");
  });

  it("color personalizado deriva hover/soft/tint/text", () => {
    const s = resolveAccentSet("#7a3b5e");
    expect(isValidHex(s.hover)).toBe(true);
    expect(isValidHex(s.soft)).toBe(true);
    expect(isValidHex(s.tint)).toBe(true);
    expect(s.hover).not.toBe(s.accent);
  });

  it("color demasiado claro se oscurece para contraste con texto blanco", () => {
    const s = resolveAccentSet("#ffee88"); // amarillo pálido, ilegible con blanco
    expect(s.accent).not.toBe("#ffee88");
    // el resultado debe ser notablemente más oscuro
    const lum = parseInt(s.accent.slice(1, 3), 16);
    expect(lum).toBeLessThan(0xd0);
  });

  it("hex inválido cae al default (el azul Vocero)", () => {
    expect(resolveAccentSet("rojo")).toEqual(ACCENT_PRESETS["#0d5bff"]!.set);
  });

  it("el azul Vocero es el default y trae los valores exactos de la landing", () => {
    expect(DEFAULT_BRANDING.accent).toBe("#0d5bff");
    expect(resolveAccentSet(DEFAULT_BRANDING.accent)).toEqual({
      accent: "#0d5bff",
      hover: "#0a4de6",
      soft: "#d3e2ff",
      tint: "#ebf1ff",
      text: "#0038d8",
      fg: "#ffffff",
    });
  });
});

describe("white-label: acento en tema oscuro", () => {
  it("un acento pensado para fondo blanco se aclara hasta despegarse del fondo", () => {
    // Azul profundo: sobre el azul marino de la página casi no se ve.
    const oscuro = resolveAccentSet("#12305a", "dark");
    expect(contrast("#12305a", DARK_BG)).toBeLessThan(3);
    expect(contrast(oscuro.accent, DARK_BG)).toBeGreaterThanOrEqual(3);
  });

  it("la tinta del botón pasa AA sobre el acento ya aclarado", () => {
    for (const hex of ["#12305a", "#3f5972", "#ffee88", "#7a3b5e"]) {
      const s = resolveAccentSet(hex, "dark");
      expect(contrast(s.fg, s.accent)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("el azul Vocero conserva la tinta blanca en oscuro", () => {
    expect(resolveAccentSet(DEFAULT_BRANDING.accent, "dark").fg).toBe("#ffffff");
  });

  it("los presets NO se aplican tal cual: están calculados para fondo blanco", () => {
    const claro = resolveAccentSet("#3f5972", "light");
    const oscuro = resolveAccentSet("#3f5972", "dark");
    expect(oscuro.accent).not.toBe(claro.accent);
    // soft y tint se mezclan hacia el fondo oscuro, no hacia blanco
    expect(contrast(oscuro.tint, DARK_BG)).toBeLessThan(2);
  });

  it("hex inválido en oscuro también cae al acento por defecto", () => {
    expect(resolveAccentSet("rojo", "dark")).toEqual(
      resolveAccentSet("#0d5bff", "dark")
    );
  });

  it("el CSS inyectado trae los DOS temas: el botón cambia sin recargar", () => {
    const css = accentCssVariables("#3f5972");
    expect(css).toContain(":root:root{");
    expect(css).toContain(':root:root[data-theme="dark"]{');
    expect(css).toContain(resolveAccentSet("#3f5972", "light").accent);
    expect(css).toContain(resolveAccentSet("#3f5972", "dark").accent);
  });

  it("el fondo de referencia del cálculo sigue al de globals.css", () => {
    // DARK_BG y NAV_BG viven duplicados en branding.ts porque el cálculo de
    // contraste es JS y el token es CSS. Si alguien cambia un fondo y no el
    // otro, los acentos se calculan contra un fondo que ya no existe.
    const css = readFileSync("src/app/globals.css", "utf8");
    const dark = variables(css, ':root[data-theme="dark"] {');
    expect(dark["--bg"]?.toLowerCase()).toBe(DARK_BG);
    expect(variables(css, ".nav-dark {")["--bg"]?.toLowerCase()).toBe(NAV_BG);
    // …y el cálculo de verdad los usa: el relleno se despega de cada uno.
    expect(contrast(resolveAccentSet("#12305a", "dark").accent, DARK_BG)).toBeGreaterThanOrEqual(3);
    expect(contrast(resolveNavAccentSet("#12305a").accent, NAV_BG)).toBeGreaterThanOrEqual(3.5);
  });
});

describe("white-label: barra lateral bicolor (.nav-dark)", () => {
  it("la barra lleva SIEMPRE el acento calculado contra su propio fondo", () => {
    // Es azul marino aunque la página esté en claro: con el acento del tema
    // claro, un color pensado para fondo blanco se hundiría en ella.
    const css = accentCssVariables("#3f5972");
    const nav = /\.nav-dark\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(nav).toContain(`--accent:${resolveNavAccentSet("#3f5972").accent};`);
    expect(nav).toContain(`--accent-fg:${resolveNavAccentSet("#3f5972").fg};`);
    expect(nav).not.toContain(resolveAccentSet("#3f5972", "light").accent);
  });

  it("con el azul Vocero, la barra se ve como siempre", () => {
    // La receta de la barra es la de antes: el ítem activo del tema claro no
    // cambia aunque el tema oscuro de la página sí.
    expect(resolveNavAccentSet(DEFAULT_BRANDING.accent)).toEqual({
      accent: "#256bff",
      hover: "#4883ff",
      soft: "#122c63",
      tint: "#0e1e41",
      text: "#6295ff",
      fg: "#ffffff",
    });
  });

  it("sus neutros son SUYOS: no copian al tema oscuro de la página", () => {
    // Antes `.nav-dark` repetía el bloque oscuro y barra y página quedaban a
    // 1.04:1. Ahora la página va un escalón arriba; si alguien vuelve a
    // igualarlas, el bicolor desaparece en oscuro: aquí se cae.
    const css = readFileSync("src/app/globals.css", "utf8");
    const oscuro = variables(css, ':root[data-theme="dark"] {');
    const nav = variables(css, ".nav-dark {");
    expect(Object.keys(nav)).toEqual(
      expect.arrayContaining(["--bg", "--bg-subtle", "--text", "--text-3", "--border"])
    );
    expect(nav["--bg-subtle"]).not.toBe(oscuro["--bg-subtle"]);
    expect(nav["--bg"]).not.toBe(oscuro["--bg"]);
  });
});

describe("tema oscuro: las superficies se distinguen", () => {
  // Con los tokens de antes, lista, hilo y barra eran tres azules marino casi
  // iguales: bordes a 1.26:1 del fondo y chips del mismo color que su fila.
  // Se afirma sobre legibilidad, no sobre un hex: el que retoque el tema
  // oscuro puede mover los valores, no el piso.
  const css = readFileSync("src/app/globals.css", "utf8");
  const oscuro = variables(css, ':root[data-theme="dark"] {');
  const claro = variables(css, ":root {");
  const tono = (nombre: string) => oscuro[nombre] ?? `falta ${nombre}`;

  it("los bordes separan las columnas: ≥ 1.6:1 contra el fondo", () => {
    expect(contrast(tono("--border"), tono("--bg"))).toBeGreaterThanOrEqual(1.6);
    expect(contrast(tono("--border-strong"), tono("--bg"))).toBeGreaterThan(
      contrast(tono("--border"), tono("--bg"))
    );
  });

  it("el chip y la fila bajo el cursor se ACLARAN respecto al fondo", () => {
    // Contra --bg, que es el de la lista: un chip o un hover más oscuros se
    // leen como un hueco, no como una superficie.
    const blanco = "#ffffff";
    for (const nombre of ["--chip-bg", "--row-hover", "--bg-hover"]) {
      expect(contrast(tono(nombre), blanco), nombre).toBeLessThan(
        contrast(tono("--bg"), blanco)
      );
    }
  });

  it("en claro, chips y hover se ven igual que antes", () => {
    expect(claro["--chip-bg"]).toBe(claro["--bg"]);
    expect(claro["--row-hover"]).toBe(claro["--bg-subtle"]);
  });
});

describe("white-label: normalización", () => {
  it("nombre vacío o nulo → default 'Vocero'; se recorta a 30", () => {
    expect(normalizeBranding(null).name).toBe("Vocero");
    expect(normalizeBranding({ name: "   " }).name).toBe("Vocero");
    expect(normalizeBranding({ name: "x".repeat(50) }).name).toHaveLength(30);
  });

  it("acento inválido → default", () => {
    expect(normalizeBranding({ accent: "azul" }).accent).toBe("#0d5bff");
    expect(normalizeBranding({ accent: "#3F6B66" }).accent).toBe("#3f6b66");
  });
});
