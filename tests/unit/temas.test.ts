import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  APARIENCIA_POR_DEFECTO,
  BASE_MINIATURA,
  atributosHtml,
  contraste,
  cssDeTemas,
  luminancia,
  parejaDe,
  resolverApariencia,
  TEMA_IDS,
  TEMAS,
  temaPropio,
  type TemaId,
} from "@/lib/temas";

/**
 * 062 — Cada tema listo pasa los mismos pisos que el claro y el oscuro de la
 * 061, medidos sobre sus tokens combinados con la base de su modo.
 */
type Vars = Record<string, string>;
const css = readFileSync("src/app/globals.css", "utf8");
function bloque(selector: string): Vars {
  const inicio = css.indexOf(selector);
  const cuerpo = css.slice(css.indexOf("{", inicio) + 1, css.indexOf("\n  }", inicio)).replace(/\/\*[\s\S]*?\*\//g, "");
  return Object.fromEntries(
    [...cuerpo.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.replace(/\s+/g, " ").trim()])
  );
}
const baseClara = bloque(":root {");
const baseOscura = { ...baseClara, ...bloque(':root[data-theme="dark"] {') };

function tokensDe(id: TemaId): Vars {
  const t = TEMAS[id];
  return { ...(t.modo === "dark" ? baseOscura : baseClara), ...t.tokens };
}
function hex(v: Vars, n: string): string {
  const raw = v[n];
  expect(raw, `falta ${n}`).toBeDefined();
  const ref = /^var\((--[\w-]+)\)$/.exec(raw!)?.[1];
  const val = ref ? v[ref] : raw;
  expect(val, `${n} no es hex`).toMatch(/^#[0-9a-f]{6}$/i);
  return val!.toLowerCase();
}
function piso(v: Vars, a: string, b: string, min: number, tema: string) {
  const c = contraste(hex(v, a), hex(v, b));
  expect(c, `${tema}: ${a} sobre ${b} = ${c.toFixed(2)} (piso ${min})`).toBeGreaterThanOrEqual(min);
}

describe("062 — cada tema listo se lee", () => {
  for (const id of TEMA_IDS) {
    it(`${TEMAS[id].nombre}`, () => {
      const v = tokensDe(id);
      const oscuro = TEMAS[id].modo === "dark";
      piso(v, "--text", "--bg", 7, id);
      for (const s of ["--bg", "--bg-subtle", "--bg-panel", "--bg-hover", "--bg-raised", "--chip-bg", "--row-hover", "--bg-active"]) {
        piso(v, "--text-2", s, 4.5, id);
        piso(v, "--text-3", s, 4.5, id);
      }
      piso(v, "--text-4", "--bg", 3, id);
      piso(v, "--border", "--bg", oscuro ? 1.6 : 1.15, id);
      piso(v, "--border-strong", "--bg", oscuro ? 2.2 : 1.35, id);
      // La burbuja del cliente se despega del hilo por su fondo o por su borde
      // (un tema de burbujas pastel, como Vocero, se apoya en el borde).
      const despegue = Math.max(
        contraste(hex(v, "--bubble-in"), hex(v, "--chat-bg")),
        contraste(hex(v, "--bubble-in-border"), hex(v, "--chat-bg"))
      );
      expect(despegue, `${id}: la burbuja del cliente contra el hilo`).toBeGreaterThanOrEqual(1.3);
      piso(v, "--bubble-in-text", "--bubble-in", 7, id);
      piso(v, "--bubble-in-muted", "--bubble-in", 4.5, id);
      piso(v, "--bubble-in-link", "--bubble-in", 4.5, id);
      piso(v, "--bubble-in-text", "--bubble-in-raised", 7, id);
      piso(v, "--bubble-out-text", "--bubble-out", 7, id);
      piso(v, "--bubble-out-muted", "--bubble-out", 4.5, id);
      piso(v, "--bubble-out-border", "--chat-bg", 1.15, id);
      piso(v, "--riel-activo", "--bg", 3, id);
      piso(v, "--riel-activo-texto", "--riel-activo", 4.5, id);
      piso(v, "--enviar", "--chat-bg", 3, id);
      piso(v, "--enviar-texto", "--enviar", 4.5, id);
      piso(v, "--bg", "--marco-2", oscuro ? 1.15 : 1.1, id);
      piso(v, "--bg-active", "--bg", 1.08, id);
      if (oscuro) expect(luminancia(hex(v, "--bg"))).toBeGreaterThan(luminancia(hex(v, "--bg-subtle")));
    });
  }

  it("las parejas existen y el modo cambia", () => {
    for (const id of TEMA_IDS) {
      const p = TEMAS[id].pareja;
      expect(TEMAS[p], `${id} → ${p}`).toBeDefined();
      expect(TEMAS[p].modo).not.toBe(TEMAS[id].modo);
    }
  });

  it("el CSS de los temas lleva un bloque por tema con tokens y sube la especificidad", () => {
    const salida = cssDeTemas();
    expect(salida).toContain(':root:root[data-tema="papel"]{');
    expect(salida).not.toContain('[data-tema="menta"]');
    expect(salida).not.toMatch(/<\/style/i);
  });
});

describe("062 — tema propio", () => {
  it("con colores legibles genera todos los tokens y pasa los pisos", () => {
    const t = temaPropio({ fondo: "#ffffff", texto: "#1b1430", marco: "#d9c8ff" });
    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.modo).toBe("light");
    const v = { ...baseClara, ...t.tokens };
    for (const s of ["--bg", "--bg-subtle", "--bg-panel", "--bg-hover"]) piso(v, "--text-3", s, 4.5, "propio");
    piso(v, "--bubble-in-text", "--bubble-in", 7, "propio");
    piso(v, "--bubble-in-muted", "--bubble-in", 4.5, "propio");
    piso(v, "--riel-activo-texto", "--riel-activo", 4.5, "propio");
  });

  it("un fondo oscuro da un tema oscuro", () => {
    const t = temaPropio({ fondo: "#101820", texto: "#f2f5f8", marco: "#05080b" });
    expect(t.ok && t.modo).toBe("dark");
  });

  it("si el texto no se lee sobre el fondo, no hay tema y dice por qué", () => {
    const t = temaPropio({ fondo: "#ffffff", texto: "#bbbbbb", marco: "#eeeeee" });
    expect(t.ok).toBe(false);
    if (!t.ok) expect(t.error).toMatch(/no se lee/);
  });
});

describe("062 — qué apariencia vale", () => {
  const negocio = { tema: "papel", letra: "inter", tamano: "grande", densidad: "compacta" };

  it("sin cookie vale la del negocio; sin negocio, la de Vocero", () => {
    expect(resolverApariencia(null, negocio)).toEqual({ apariencia: negocio, propia: false });
    expect(resolverApariencia(undefined, null).apariencia).toEqual(APARIENCIA_POR_DEFECTO);
  });

  it("la cookie válida de la persona gana", () => {
    const mia = { tema: "medianoche", letra: "plex", tamano: "chico", densidad: "espaciosa" };
    expect(resolverApariencia(encodeURIComponent(JSON.stringify(mia)), negocio)).toEqual({ apariencia: mia, propia: true });
  });

  it("una cookie manipulada o un tema propio ilegible caen a la del negocio", () => {
    expect(resolverApariencia("{no es json", negocio).apariencia).toEqual(negocio);
    expect(resolverApariencia(JSON.stringify({ tema: "hackeado", letra: "x" }), negocio).apariencia).toEqual(negocio);
    const ilegible = { tema: "propio", propio: { fondo: "#ffffff", texto: "#eeeeee", marco: "#dddddd" }, letra: "urbanist", tamano: "normal", densidad: "normal" };
    expect(resolverApariencia(JSON.stringify(ilegible), negocio).propia).toBe(false);
  });

  it("el sol y la luna saltan a la pareja y los atributos dicen el modo", () => {
    const a = { ...APARIENCIA_POR_DEFECTO, tema: "menta" as const };
    expect(parejaDe(a).tema).toBe("noche");
    expect(parejaDe(parejaDe(a)).tema).toBe("menta");
    expect(atributosHtml(parejaDe(a))["data-theme"]).toBe("dark");
    expect(atributosHtml(a)).toMatchObject({ "data-tema": "menta", "data-letra": "urbanist", "data-tamano": "normal", "data-densidad": "normal" });
  });
});

describe("062 — la miniatura usa los tokens de globals.css", () => {
  it("la copia de Menta y Noche es la de globals.css", () => {
    for (const [k, v] of Object.entries(BASE_MINIATURA.light)) expect(hex(baseClara, k), k).toBe(v);
    for (const [k, v] of Object.entries(BASE_MINIATURA.dark)) expect(hex(baseOscura, k), k).toBe(v);
  });
});
