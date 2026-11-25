import { describe, expect, it } from "vitest";
import { dejaLaRafagaAbierta, ventanaParaMensaje } from "@/server/dispatch/ventana";

const t = (text: string) => ({ type: "text", text });

describe("078 — la espera la decide el último mensaje de la ráfaga", () => {
  it("saludos, «ok» y el texto prellenado de un anuncio dejan la ráfaga abierta", () => {
    for (const s of [
      "Hola",
      "hola!!",
      "¡Hola!",
      "Buenas tardes",
      "buen día",
      "Ok",
      "Sii",
      "Gracias",
      "Qué tal",
      "¡Hola! Quiero más información",
      "Hola, quiero más información sobre esto",
      "Me interesa",
      "Vi su anuncio en Facebook y quisiera detalles",
    ]) {
      expect(dejaLaRafagaAbierta(t(s)), s).toBe(true);
    }
  });

  it("tres palabras o menos sin pregunta, también", () => {
    expect(dejaLaRafagaAbierta(t("Precio"))).toBe(true);
    expect(dejaLaRafagaAbierta(t("limpieza dental"))).toBe(true);
    expect(dejaLaRafagaAbierta(t("Estado de México"))).toBe(true);
  });

  it("una pregunta o una frase completa no: el cliente ya dijo lo que quería", () => {
    for (const s of [
      "¿Precio?",
      "Envían a Monterrey?",
      "Cuánto cuesta la limpieza con blanqueamiento incluido",
      "Te puedo hacer unas preguntas",
    ]) {
      expect(dejaLaRafagaAbierta(t(s)), s).toBe(false);
    }
  });

  it("una foto o un sticker la dejan abierta; un audio, un documento o un texto vacío, no", () => {
    expect(dejaLaRafagaAbierta({ type: "image", text: null })).toBe(true);
    expect(dejaLaRafagaAbierta({ type: "sticker", text: null })).toBe(true);
    expect(dejaLaRafagaAbierta({ type: "audio", text: null })).toBe(false);
    expect(dejaLaRafagaAbierta({ type: "document", text: null })).toBe(false);
    expect(dejaLaRafagaAbierta(t("   "))).toBe(false);
    expect(dejaLaRafagaAbierta({ type: "text", text: null })).toBe(false);
  });

  it("elige la espera larga o la normal, y la larga nunca es menor que la normal", () => {
    expect(ventanaParaMensaje(t("Hola"), 3000, 8000)).toBe(8000);
    expect(ventanaParaMensaje(t("Envían a Monterrey?"), 3000, 8000)).toBe(3000);
    expect(ventanaParaMensaje(null, 3000, 8000)).toBe(3000);
    expect(ventanaParaMensaje(t("Hola"), 6000, 2000)).toBe(6000);
  });
});
