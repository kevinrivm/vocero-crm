import { describe, expect, it } from "vitest";
import { CAPACIDAD_ATENCION_HUMANA, capacidadesDelCrm } from "@/server/brains/contract";
import { armarAtencion, MAX_TEXTO_ATENCION, recortarParaNota } from "@/server/brains/atencion-humana";

/**
 * 076 — «Hubo una persona», tal como lo ve un cerebro.
 *
 * `EVENTO_GEMELO` es el mismo cuerpo que fija Vocero Cloud, y el que prueba
 * `tests/test_atencion_humana.py` de nea-agent del otro lado: que
 * Nea lee este campo, lo pone en el prompt y, sin él, el prompt no cambia. Si
 * aquí cambia un nombre o el orden de una clave, esta prueba falla antes de
 * que Nea vuelva a contradecir al equipo.
 */
const EVENTO_GEMELO =
  '{"humanAttention":{"since":"2026-11-20T15:00:00.000Z",' +
  '"lastTeamMessageAt":"2026-11-20T15:05:00.000Z","messages":[' +
  '{"at":"2026-11-20T14:58:00.000Z","author":"customer","type":"text","text":"¿Cuánto cuesta la limpieza?"},' +
  '{"at":"2026-11-20T15:00:00.000Z","author":"team","type":"text","text":"La limpieza queda en $850 con la promoción de esta semana."},' +
  '{"at":"2026-11-20T15:05:00.000Z","author":"team","type":"image","text":null}]}}';

describe("contrato de la nota «hubo una persona»", () => {
  it("el CRM la anuncia en cada despacho", () => {
    expect(CAPACIDAD_ATENCION_HUMANA).toBe("atencion_humana");
    expect(capacidadesDelCrm()).toContain(CAPACIDAD_ATENCION_HUMANA);
  });

  it("arma exactamente el cuerpo gemelo, en el mismo orden", () => {
    const campo = armarAtencion(new Date("2026-11-20T15:00:00.000Z"), new Date("2026-11-20T15:05:00.000Z"), [
      { at: new Date("2026-11-20T14:58:00.000Z"), direction: "in", type: "text", text: "¿Cuánto cuesta la limpieza?" },
      { at: new Date("2026-11-20T15:00:00.000Z"), direction: "out", type: "text", text: "La limpieza queda en $850 con la promoción de esta semana." },
      { at: new Date("2026-11-20T15:05:00.000Z"), direction: "out", type: "image", text: null },
    ]);
    expect(JSON.stringify({ humanAttention: campo })).toBe(EVENTO_GEMELO);
  });

  it("recorta y limpia el texto, sin inventar nada", () => {
    expect(recortarParaNota(null)).toBeNull();
    expect(recortarParaNota("   ")).toBeNull();
    expect(recortarParaNota("hola\n\n  qué tal")).toBe("hola qué tal");
    const largo = recortarParaNota("a".repeat(2000));
    expect(largo).toHaveLength(MAX_TEXTO_ATENCION);
    expect(largo?.endsWith("…")).toBe(true);
  });
});
