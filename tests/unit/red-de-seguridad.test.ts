import { describe, expect, it } from "vitest";
import { esCierre, todoEsCierre } from "@/server/dispatch/cierres";
import {
  decidir,
  MARGEN_DE_VENTANA_MS,
  MAX_RELANZAMIENTOS,
  type EntradaDecision,
} from "@/server/dispatch/red-de-seguridad";

/**
 * 075 — Qué hace la red de seguridad con un turno que el cerebro recibió y
 * nadie contestó. `decidir` es pura: cada salida se prueba sin base.
 */

const ahora = new Date("2026-11-20T12:00:00.000Z");
const DIA = 24 * 3_600_000;
const convBase = {
  isTest: false,
  aiEnabled: true,
  handoffAt: null as Date | null,
  lastInboundAt: new Date(ahora.getTime() - 15 * 60_000) as Date | null,
  ventanaMs: DIA,
};
const base: EntradaDecision = {
  relaunchCount: 0,
  hayPosterior: false,
  hayRespuesta: false,
  despachoActivo: true,
  agenteEncendido: true,
  conversacion: convBase,
  pendientes: [{ type: "text", text: "¿hacen envíos a domicilio?" }],
  ultimaSalida: null,
  ahora,
};
const conv = (cambio: Partial<typeof convBase>): Partial<EntradaDecision> => ({
  conversacion: { ...convBase, ...cambio },
});

const NO_HACE_NADA: [string, Partial<EntradaDecision>][] = [
  ["el cliente volvió a escribir (hay un despacho posterior)", { hayPosterior: true }],
  ["ya salió algo después de la entrega", { hayRespuesta: true }],
  ["la conversación ya no existe", { conversacion: null }],
  ["es una conversación de prueba", conv({ isTest: true })],
  ["el despacho ya no está configurado", { despachoActivo: false }],
  ["el agente está apagado", { agenteEncendido: false }],
  ["la IA está en pausa", conv({ aiEnabled: false })],
  ["la atiende una persona", conv({ handoffAt: ahora })],
  ["nunca escribió el cliente", conv({ lastInboundAt: null })],
  ["no queda nada pendiente", { pendientes: [] }],
  ["solo hay un «gracias»", { pendientes: [{ type: "text", text: "Muchas gracias!! 🙏" }] }],
  ["solo hay un sticker", { pendientes: [{ type: "sticker", text: null }] }],
];

describe("decidir", () => {
  it("relanza la primera y la segunda vez", () => {
    expect(decidir(base)).toEqual({ accion: "relanzar", vuelta: 1 });
    expect(decidir({ ...base, relaunchCount: 1 })).toEqual({ accion: "relanzar", vuelta: 2 });
  });

  it("tras dos relanzamientos sin respuesta, pasa a una persona", () => {
    expect(MAX_RELANZAMIENTOS).toBe(2);
    expect(decidir({ ...base, relaunchCount: 2 })).toEqual({ accion: "traspasar" });
  });

  it.each(NO_HACE_NADA)("no hace nada si %s", (_, cambio) => {
    expect(decidir({ ...base, ...cambio }).accion).toBe("nada");
  });

  it("nunca fuera de la ventana del canal (con margen)", () => {
    const casiCerrada = new Date(ahora.getTime() - (DIA - MARGEN_DE_VENTANA_MS) - 1);
    expect(decidir({ ...base, ...conv({ lastInboundAt: casiCerrada }) }).accion).toBe("nada");
    // La ventana es la del canal: con 48 h, el mismo mensaje sí se relanza.
    expect(
      decidir({ ...base, ...conv({ lastInboundAt: casiCerrada, ventanaMs: 2 * DIA }) }).accion
    ).toBe("relanzar");
  });

  it("tampoco traspasa si la IA ya está en pausa", () => {
    expect(decidir({ ...base, relaunchCount: 2, ...conv({ aiEnabled: false }) }).accion).toBe("nada");
  });

  it("un «ok» tras una pregunta del agente SÍ espera respuesta", () => {
    const ok = { ...base, pendientes: [{ type: "text", text: "ok" }] };
    expect(decidir(ok).accion).toBe("nada");
    expect(decidir({ ...ok, ultimaSalida: "¿Te aparto el jueves a las 10?" }).accion).toBe("relanzar");
  });
});

describe("cierres", () => {
  it.each([
    "gracias",
    "ok",
    "Ok 👍",
    "👍",
    "🙏🏻",
    "muchas gracias!",
    "va, gracias",
    "perfecto gracias",
    "okkk",
    "jajaja",
    "de acuerdo",
    "buenas noches",
    "Graciaaas",
  ])("«%s» es un cierre", (t) => expect(esCierre("text", t)).toBe(true));

  it.each([
    "¿y el precio?",
    "gracias, ¿cuánto cuesta?",
    "quiero agendar",
    "sí",
    "a",
    "hola",
    "ok pero el jueves no puedo, mejor el viernes a las 5",
  ])("«%s» NO es un cierre", (t) => expect(esCierre("text", t)).toBe(false));

  it("una reacción o un sticker no piden respuesta; una foto o un audio sí", () => {
    expect(esCierre("reaction", null)).toBe(true);
    expect(esCierre("sticker", null)).toBe(true);
    expect(esCierre("image", null)).toBe(false);
    expect(esCierre("audio", null)).toBe(false);
  });

  it("todo cierre: todos los pendientes, y una lista vacía no lo es", () => {
    expect(todoEsCierre([{ type: "text", text: "ok" }, { type: "text", text: "gracias" }])).toBe(true);
    expect(todoEsCierre([{ type: "text", text: "ok" }, { type: "text", text: "¿y mañana?" }])).toBe(false);
    expect(todoEsCierre([])).toBe(false);
  });
});
