import { describe, expect, it } from "vitest";
import { CIERRE_MAX_MS, QUIETUD_MS, esperarCalma } from "@/server/lab/cierre-de-turno";

/**
 * 071 — El turno del cerebro se cierra cuando deja de pasar algo, no tras un
 * margen fijo. Reloj simulado: `dormir` avanza el tiempo, y la huella es lo
 * que el cerebro ya hizo a esa hora.
 */
function cerebro(eventos: { a: number; que: string }[]) {
  let t = 0;
  const huella = async () =>
    eventos
      .filter((e) => e.a <= t)
      .map((e) => e.que)
      .join(",");
  return {
    huella,
    opciones: {
      ahora: () => t,
      dormir: async (ms: number) => {
        t += ms;
      },
    },
    tiempo: () => t,
  };
}

describe("esperarCalma", () => {
  it("un mensaje y el traspaso 2.9 s después: espera al traspaso", async () => {
    // t=0 es cuando el turno ya vio el mensaje.
    const c = cerebro([
      { a: 0, que: "mensaje" },
      { a: 2_900, que: "traspaso" },
    ]);
    const vistas: string[] = [];
    const motivo = await esperarCalma(async () => {
      const h = await c.huella();
      vistas.push(h);
      return h;
    }, c.opciones);
    expect(motivo).toBe("calma");
    expect(vistas.at(-1)).toBe("mensaje,traspaso");
    // Cerró una ventana completa después del traspaso, no antes.
    expect(c.tiempo()).toBeGreaterThanOrEqual(2_900 + QUIETUD_MS);
  });

  it("traspasa primero y se despide después: la despedida entra en el turno", async () => {
    const c = cerebro([
      { a: 0, que: "traspaso" },
      { a: 1_200, que: "despedida" },
    ]);
    let ultima = "";
    await esperarCalma(async () => (ultima = await c.huella()), c.opciones);
    expect(ultima).toBe("traspaso,despedida");
  });

  it("sin novedades, cierra a los QUIETUD_MS", async () => {
    const c = cerebro([{ a: 0, que: "mensaje" }]);
    expect(await esperarCalma(c.huella, c.opciones)).toBe("calma");
    expect(c.tiempo()).toBeGreaterThanOrEqual(QUIETUD_MS);
    expect(c.tiempo()).toBeLessThan(QUIETUD_MS + 1_000);
  });

  it("un cerebro que no para de escribir se corta al tope", async () => {
    const eventos = Array.from({ length: 200 }, (_, i) => ({ a: i * 1_000, que: `m${i}` }));
    const c = cerebro(eventos);
    expect(await esperarCalma(c.huella, c.opciones)).toBe("tope");
    expect(c.tiempo()).toBeGreaterThanOrEqual(CIERRE_MAX_MS);
    expect(c.tiempo()).toBeLessThan(CIERRE_MAX_MS + 1_000);
  });

  it("varios mensajes seguidos extienden la ventana", async () => {
    const c = cerebro([
      { a: 0, que: "uno" },
      { a: 3_000, que: "dos" },
      { a: 6_500, que: "tres" },
    ]);
    let ultima = "";
    expect(await esperarCalma(async () => (ultima = await c.huella()), c.opciones)).toBe("calma");
    expect(ultima).toBe("uno,dos,tres");
  });
});
