import { describe, expect, it } from "vitest";
import {
  decidirVuelta,
  finDePausa,
  HORAS_REACTIVACION_NUEVAS,
  MOTIVOS_QUE_VUELVEN,
  type EstadoPausa,
} from "@/server/inbox/reactivacion";
import { textoVuelta } from "@/lib/eventos-hilo";

/** 076 — Cuándo vuelve la IA sola y la pausa con duración. */

const H = 3_600_000;
const AHORA = new Date("2026-11-23T18:00:00.000Z");
const hace = (horas: number) => new Date(AHORA.getTime() - horas * H);

function estado(o: Partial<EstadoPausa> = {}): EstadoPausa {
  return {
    isTest: false,
    aiEnabled: true,
    handoffAt: null,
    handoffReason: null,
    aiPausedUntil: null,
    lastTeamOutAt: null,
    ...o,
  };
}

describe("decidirVuelta — traspaso a una persona", () => {
  it("vuelve si el equipo lleva N horas sin escribir", () => {
    const c = estado({ handoffAt: hace(30), handoffReason: "manual_reply", lastTeamOutAt: hace(25) });
    expect(decidirVuelta(c, { horas: 24, now: AHORA })).toEqual({ motivo: "sin_equipo", horas: 24 });
  });

  it("antes de N horas sigue en pausa, aunque el traspaso sea viejo", () => {
    // El equipo contestó hace 2 h en un traspaso de hace 3 días: la lleva una persona.
    const c = estado({ handoffAt: hace(72), handoffReason: "manual_reply", lastTeamOutAt: hace(2) });
    expect(decidirVuelta(c, { horas: 24, now: AHORA })).toBeNull();
  });

  it("contestar apaga ai_enabled: con traspaso esa bandera no cuenta", () => {
    const c = estado({ aiEnabled: false, handoffAt: hace(30), handoffReason: "manual_reply", lastTeamOutAt: hace(30) });
    expect(decidirVuelta(c, { horas: 24, now: AHORA })?.motivo).toBe("sin_equipo");
  });

  it("sin mensajes del equipo cuenta desde el traspaso", () => {
    const c = estado({ handoffAt: hace(23), handoffReason: "cliente" });
    expect(decidirVuelta(c, { horas: 24, now: AHORA })).toBeNull();
    expect(decidirVuelta({ ...c, handoffAt: hace(24) }, { horas: 24, now: AHORA })?.motivo).toBe("sin_equipo");
  });

  it("con el ajuste vacío (null) nunca vuelve", () => {
    const c = estado({ handoffAt: hace(500), handoffReason: "modelo" });
    expect(decidirVuelta(c, { horas: null, now: AHORA })).toBeNull();
    expect(decidirVuelta(c, { horas: 0, now: AHORA })).toBeNull();
  });

  it("nunca tras hostilidad ni con un motivo desconocido", () => {
    for (const motivo of ["hostilidad", "sin_credencial", "otro_que_no_existe"]) {
      const c = estado({ handoffAt: hace(500), handoffReason: motivo });
      expect(decidirVuelta(c, { horas: 1, now: AHORA })).toBeNull();
    }
    expect(MOTIVOS_QUE_VUELVEN).not.toContain("hostilidad");
  });

  it("nunca en una conversación de prueba", () => {
    const c = estado({ isTest: true, handoffAt: hace(500), handoffReason: "cliente" });
    expect(decidirVuelta(c, { horas: 1, now: AHORA })).toBeNull();
  });

  it("una IA que no está en pausa no «vuelve»", () => {
    expect(decidirVuelta(estado(), { horas: 1, now: AHORA })).toBeNull();
  });
});

describe("decidirVuelta — pausa manual con fecha", () => {
  it("vuelve al vencer", () => {
    const c = estado({ aiEnabled: false, aiPausedUntil: hace(0.1) });
    expect(decidirVuelta(c, { horas: null, now: AHORA })).toEqual({ motivo: "pausa_vencida", horas: null });
  });

  it("vigente, no vuelve aunque el traspaso ya cumpla las N horas", () => {
    const c = estado({ aiEnabled: false, aiPausedUntil: new Date(AHORA.getTime() + H), handoffAt: hace(100), handoffReason: "cliente" });
    expect(decidirVuelta(c, { horas: 24, now: AHORA })).toBeNull();
  });

  it("sin fecha es indefinida", () => {
    const c = estado({ aiEnabled: false, aiPausedUntil: null });
    expect(decidirVuelta(c, { horas: 1, now: AHORA })).toBeNull();
  });

  it("vencida, pero el equipo escribió hace poco por un camino que no pausa: sigue con el equipo", () => {
    const c = estado({ aiEnabled: false, aiPausedUntil: hace(1), lastTeamOutAt: hace(0.5) });
    expect(decidirVuelta(c, { horas: 24, now: AHORA })).toBeNull();
  });

  it("vencida con traspaso: manda la regla del equipo", () => {
    const c = estado({ aiEnabled: false, aiPausedUntil: hace(1), handoffAt: hace(2), handoffReason: "manual_reply", lastTeamOutAt: hace(2) });
    expect(decidirVuelta(c, { horas: 24, now: AHORA })).toBeNull();
    expect(decidirVuelta(c, { horas: null, now: AHORA })).toBeNull();
    expect(decidirVuelta(c, { horas: 1, now: AHORA })).toEqual({ motivo: "sin_equipo", horas: 1 });
  });
});

describe("finDePausa", () => {
  it("1 hora", () => {
    expect(finDePausa("1h", "America/Mexico_City", AHORA)?.toISOString()).toBe("2026-11-23T19:00:00.000Z");
  });

  it("hasta mañana = las 9:00 del día siguiente en la zona del negocio", () => {
    // 18:00 UTC = 12:00 en CDMX (UTC−6): mañana 9:00 CDMX = 15:00 UTC.
    expect(finDePausa("manana", "America/Mexico_City", AHORA)?.toISOString()).toBe("2026-11-24T15:00:00.000Z");
    // En Madrid (UTC+1) ya son las 19:00: mañana 9:00 = 8:00 UTC.
    expect(finDePausa("manana", "Europe/Madrid", AHORA)?.toISOString()).toBe("2026-11-24T08:00:00.000Z");
    // A las 23:30 de CDMX sigue siendo la mañana siguiente.
    const noche = new Date("2026-11-24T05:30:00.000Z");
    expect(finDePausa("manana", "America/Mexico_City", noche)?.toISOString()).toBe("2026-11-24T15:00:00.000Z");
  });

  it("de madrugada, «hasta mañana» es la mañana de ese mismo día", () => {
    // 1:00 en CDMX del 24: vuelve a las 9:00 del 24, no del 25.
    const madrugada = new Date("2026-11-24T07:00:00.000Z");
    expect(finDePausa("manana", "America/Mexico_City", madrugada)?.toISOString()).toBe("2026-11-24T15:00:00.000Z");
    // 5:00 ya es de día: la del día siguiente.
    const temprano = new Date("2026-11-24T11:00:00.000Z");
    expect(finDePausa("manana", "America/Mexico_City", temprano)?.toISOString()).toBe("2026-11-25T15:00:00.000Z");
  });

  it("indefinida no tiene fin", () => {
    expect(finDePausa("indefinida", "America/Mexico_City", AHORA)).toBeNull();
  });
});

describe("valores por defecto y textos", () => {
  it("un negocio nuevo nace con 24 h", () => {
    expect(HORAS_REACTIVACION_NUEVAS).toBe(24);
  });

  it("el hilo dice por qué volvió", () => {
    expect(textoVuelta("sin_equipo", 24)).toBe("La IA volvió a atender (24 h sin respuesta del equipo)");
    expect(textoVuelta("pausa_vencida", null)).toBe("La IA volvió a atender (terminó la pausa)");
  });
});
