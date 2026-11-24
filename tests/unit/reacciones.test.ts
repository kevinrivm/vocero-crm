import { describe, expect, it } from "vitest";
import {
  agruparReacciones,
  canalReacciona,
  emojiAlElegir,
  emojiValido,
  esReaccionable,
  idZernioDe,
  reaccionDelEquipo,
  type ReaccionDto,
} from "@/lib/reacciones";
import { REACCION_ERROR_STATUS } from "@/server/inbox/reacciones";
import { ZERNIO_MESSAGE_EVENT, ZERNIO_REACTION_EVENT, coversAccount } from "@/server/zernio/webhooks";

/** 072 — Reacciones a mensajes: lo puro. El flujo vivo lo cubre el E2E. */

const cliente: ReaccionDto = { emoji: "👍", actor: "cliente", nombre: "Ana" };
const equipo: ReaccionDto = { emoji: "👍", actor: "equipo", nombre: "Sele" };

describe("072 — agruparReacciones", () => {
  it("junta el mismo emoji y recuerda quiénes y si incluye al equipo", () => {
    const grupos = agruparReacciones([cliente, equipo]);
    expect(grupos).toEqual([{ emoji: "👍", cuantos: 2, nombres: ["Ana", "Sele"], delEquipo: true }]);
  });

  it("una pastilla por emoji distinto, en orden de llegada", () => {
    const grupos = agruparReacciones([cliente, { ...equipo, emoji: "❤️" }]);
    expect(grupos.map((g) => g.emoji)).toEqual(["👍", "❤️"]);
    expect(grupos[0]!.delEquipo).toBe(false);
  });

  it("sin nombre dice Cliente o Tu equipo", () => {
    const grupos = agruparReacciones([
      { emoji: "😂", actor: "cliente", nombre: null },
      { emoji: "😂", actor: "equipo", nombre: null },
    ]);
    expect(grupos[0]!.nombres).toEqual(["Cliente", "Tu equipo"]);
  });
});

describe("072 — elegir, cambiar y quitar", () => {
  it("la reacción del equipo es la única que cuenta para el menú", () => {
    expect(reaccionDelEquipo([cliente])).toBeNull();
    expect(reaccionDelEquipo([cliente, { ...equipo, emoji: "🙏" }])).toBe("🙏");
    expect(reaccionDelEquipo(undefined)).toBeNull();
  });

  it("el mismo emoji la quita, otro la reemplaza", () => {
    expect(emojiAlElegir(null, "👍")).toBe("👍");
    expect(emojiAlElegir("👍", "👍")).toBe("");
    expect(emojiAlElegir("👍", "❤️")).toBe("❤️");
  });
});

describe("072 — emojiValido", () => {
  it.each(["", "👍", "❤️", "👍🏽", "👨‍👩‍👧", "🇲🇽", "1️⃣"])("acepta %j", (e) => {
    expect(emojiValido(e)).toBe(true);
  });
  it.each(["hola", "a👍", "👍 ", "1", " ", "<script>"])("rechaza %j", (e) => {
    expect(emojiValido(e)).toBe(false);
  });
  it("rechaza un chorro largo", () => {
    expect(emojiValido("👍".repeat(20))).toBe(false);
  });
});

describe("072 — ids y quién se puede reaccionar", () => {
  it("el id de Zernio sin el prefijo del entrante ni la parte del adjunto", () => {
    expect(idZernioDe("ig_abc123")).toBe("abc123");
    expect(idZernioDe("fb_m_99#2")).toBe("m_99");
    expect(idZernioDe("zmsg_1")).toBe("zmsg_1");
  });

  it("solo con id real de la plataforma, y nunca a otra reacción", () => {
    expect(esReaccionable({ waMessageId: "wamid.X", type: "text" })).toBe(true);
    expect(esReaccionable({ waMessageId: null, type: "text" })).toBe(false);
    expect(esReaccionable({ waMessageId: "zernio_123", type: "text" })).toBe(false);
    expect(esReaccionable({ waMessageId: "wamid.Y", type: "reaction" })).toBe(false);
  });

  it("WhatsApp, Instagram y Messenger reaccionan; TikTok no (D4)", () => {
    expect(canalReacciona("whatsapp")).toBe(true);
    expect(canalReacciona("instagram")).toBe(true);
    expect(canalReacciona("messenger")).toBe(true);
    expect(canalReacciona("tiktok")).toBe(false);
  });
});

describe("072 — contrato", () => {
  it("el Laboratorio es 403 y la ventana cerrada 409", () => {
    expect(REACCION_ERROR_STATUS.sandbox_violation).toBe(403);
    expect(REACCION_ERROR_STATUS.window_closed).toBe(409);
    expect(REACCION_ERROR_STATUS.not_found).toBe(404);
  });

  it("un webhook de Zernio con mensajes y reacciones sigue cubriendo la cuenta (D9)", () => {
    expect(ZERNIO_REACTION_EVENT).toBe("reaction.received");
    expect(
      coversAccount(
        { _id: "w", events: [ZERNIO_MESSAGE_EVENT, ZERNIO_REACTION_EVENT], accountIds: [] } as never,
        "acc_1"
      )
    ).toBe(true);
  });
});
