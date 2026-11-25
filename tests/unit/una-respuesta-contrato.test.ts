import { describe, expect, it } from "vitest";
import {
  armarEvento,
  CAPACIDAD_SUPERADO,
  capacidadesDelCrm,
} from "@/server/brains/contract";
import {
  cuerpoRespuesta,
  DISPATCH_SUPERADO,
  MENSAJE_SUPERADO,
  pideCallarSiSuperado,
} from "@/server/bot/respuesta";
import { toHandoffReason } from "@/server/bot/handoff";
import { textoTraspaso } from "@/lib/eventos-hilo";
import { HANDOFF_LABEL } from "@/lib/analytics";

/**
 * 075 — Una sola respuesta por ráfaga, tal como la ve un cerebro.
 *
 * Las cadenas son contrato compartido con Vocero Cloud y con Nea
 * (`tests/test_despacho_superado.py` en nea-agent fija este mismo cuerpo):
 * un cerebro que sirve a las dos ediciones manda exactamente esto.
 */
const CUERPO_GEMELO =
  '{"dispatchId":"dsp_gemelo1","conversationId":"cv_gemela1","text":"¡Hola! Sí tenemos.","dropIfSuperseded":true}';
const ERROR_GEMELO =
  '{"error":{"code":"dispatch_superado","message":"El cliente escribió de nuevo; responde el despacho más reciente"}}';

function evento(extra: { capabilities?: string[]; relaunch?: number } = {}) {
  return armarEvento({
    dispatchId: "dsp_1",
    organization: { id: "org_1", slug: null },
    conversation: {
      id: "cv_1",
      channel: "whatsapp",
      aiEnabled: true,
      windowOpen: true,
      windowExpiresAt: null,
    },
    contact: { id: "ct_1", displayName: "Ana", identity: "5215500000000" },
    messages: [],
    firstMessageAt: new Date("2026-11-01T00:00:00.000Z"),
    lastMessageAt: new Date("2026-11-01T00:00:00.000Z"),
    ...extra,
  });
}

const BASE = [
  "dispatchId",
  "organization",
  "conversation",
  "contact",
  "messages",
  "firstMessageAt",
  "lastMessageAt",
];

describe("el CRM anuncia el turno superado", () => {
  it("con la misma cadena que Vocero Cloud", () => {
    expect(CAPACIDAD_SUPERADO).toBe("dispatch_superado");
    // 076: después anuncia también la nota de atención humana.
    expect(capacidadesDelCrm()).toEqual([CAPACIDAD_SUPERADO, "atencion_humana"]);
  });

  it("al final del evento, sin mover ninguna clave de antes", () => {
    expect(Object.keys(evento({ capabilities: capacidadesDelCrm() }))).toEqual([
      ...BASE,
      "capabilities",
    ]);
  });

  it("sin capacidades, el evento es el de siempre (el cuerpo gemelo no cambia)", () => {
    expect(Object.keys(evento())).toEqual(BASE);
    expect(Object.keys(evento({ capabilities: [] }))).toEqual(BASE);
  });
});

describe("relaunch", () => {
  it("solo viaja en un relanzamiento, después de las capacidades", () => {
    const e = evento({ capabilities: ["dispatch_superado"], relaunch: 2 });
    expect(Object.keys(e)).toEqual([...BASE, "capabilities", "relaunch"]);
    expect(e.relaunch).toBe(2);
  });

  it("un despacho normal no la lleva", () => {
    expect("relaunch" in evento({ relaunch: 0 })).toBe(false);
    expect("relaunch" in evento()).toBe(false);
  });
});

describe("el cuerpo de POST /api/bot/messages", () => {
  it("acepta el cuerpo gemelo y lee la petición de callar", () => {
    const r = cuerpoRespuesta.safeParse(JSON.parse(CUERPO_GEMELO));
    expect(r.success).toBe(true);
    expect(r.success && pideCallarSiSuperado(r.data)).toBe(true);
  });

  it("un cerebro que no manda dispatchId sigue igual", () => {
    const r = cuerpoRespuesta.safeParse({ conversationId: "cv_1", text: "hola" });
    expect(r.success).toBe(true);
    expect(r.success && r.data.dispatchId).toBeUndefined();
    expect(r.success && pideCallarSiSuperado(r.data)).toBe(false);
  });

  it("dropIfSuperseded sin dispatchId no pide nada: no sabe de qué turno es", () => {
    const r = cuerpoRespuesta.safeParse({ conversationId: "c", text: "t", dropIfSuperseded: true });
    expect(r.success && pideCallarSiSuperado(r.data)).toBe(false);
  });

  it("dispatchId sin dropIfSuperseded tampoco: callar es opt-in, como en Cloud", () => {
    const r = cuerpoRespuesta.safeParse({ dispatchId: "d", conversationId: "c", text: "t" });
    expect(r.success && pideCallarSiSuperado(r.data)).toBe(false);
  });

  it("un dropIfSuperseded que no es booleano se rechaza, no se interpreta", () => {
    expect(
      cuerpoRespuesta.safeParse({ dispatchId: "d", conversationId: "c", text: "t", dropIfSuperseded: "sí" })
        .success
    ).toBe(false);
  });

  it("el código del 409 es el que Nea calla", () => {
    expect(DISPATCH_SUPERADO).toBe("dispatch_superado");
    expect(JSON.parse(ERROR_GEMELO).error.code).toBe(DISPATCH_SUPERADO);
    expect(JSON.parse(ERROR_GEMELO).error.message).toBe(MENSAJE_SUPERADO);
  });
});

describe("el traspaso sin_respuesta", () => {
  it("el catálogo lo acepta tal cual (no cae a «modelo»)", () => {
    expect(toHandoffReason("sin_respuesta")).toBe("sin_respuesta");
  });

  it("tiene etiqueta en el hilo y en Resultados", () => {
    expect(textoTraspaso("sin_respuesta")).toMatch(/no logró contestar/);
    expect(HANDOFF_LABEL.sin_respuesta).toBeTruthy();
  });
});
