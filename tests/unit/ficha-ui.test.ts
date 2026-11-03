import { describe, expect, it } from "vitest";
import {
  fichaEntries,
  fichaLabel,
  fichaValueText,
  parseFichaValue,
} from "@/lib/ficha";

describe("fichaLabel", () => {
  it("lee bonito lo que escribió un LLM, en cualquiera de sus manías", () => {
    expect(fichaLabel("dolor_principal")).toBe("Dolor principal");
    expect(fichaLabel("dolorPrincipal")).toBe("Dolor principal");
    expect(fichaLabel("dolor-principal")).toBe("Dolor principal");
    expect(fichaLabel("presupuesto")).toBe("Presupuesto");
  });

  it("no se rompe con claves raras", () => {
    expect(fichaLabel("m2")).toBe("M2");
    expect(fichaLabel("__")).toBe("__");
    expect(fichaLabel("ZONA")).toBe("Zona");
  });
});

describe("fichaValueText", () => {
  it("los booleanos se leen Sí/No: nadie califica en true", () => {
    expect(fichaValueText(true)).toBe("Sí");
    expect(fichaValueText(false)).toBe("No");
    expect(fichaValueText(true, "pt-BR")).toBe("Sim");
    expect(fichaValueText(false, "pt-BR")).toBe("Não");
  });

  it("números y textos pasan tal cual", () => {
    expect(fichaValueText(50000)).toBe("50000");
    expect(fichaValueText("Polanco")).toBe("Polanco");
  });
});

describe("parseFichaValue", () => {
  it("editar NO cambia el tipo del dato", () => {
    // Del otro lado hay un bot que puede estar comparando; convertir en
    // silencio un número a texto es de los cambios que solo se descubren
    // cuando algo ya falló.
    expect(parseFichaValue("60000", 50000)).toBe(60000);
    expect(parseFichaValue("No", true)).toBe(false);
    expect(parseFichaValue("sí", false)).toBe(true);
    expect(parseFichaValue("Sim", false)).toBe(true);
    expect(parseFichaValue("Não", true)).toBe(false);
    expect(parseFichaValue("nao", true)).toBe(false);
    expect(parseFichaValue("Sim", "Não")).toBe("Sim");
    expect(parseFichaValue("Polanco", "Roma")).toBe("Polanco");
  });

  it("pero sí lo cambia si lo escrito ya no es de ese tipo", () => {
    expect(parseFichaValue("como cinco mil", 5000)).toBe("como cinco mil");
    expect(parseFichaValue("depende", true)).toBe("depende");
  });

  it("un dato nuevo entra como texto", () => {
    expect(parseFichaValue("42", undefined)).toBe("42");
  });

  it("recorta los espacios de sobra", () => {
    expect(parseFichaValue("  Polanco  ", "Roma")).toBe("Polanco");
  });
});

describe("fichaEntries", () => {
  it("ordena para que la ficha no baile entre recargas", () => {
    const claves = fichaEntries({ zona: "Roma", dolor: "x", presupuesto: 1 }).map(
      ([k]) => k
    );
    expect(claves).toEqual(["dolor", "presupuesto", "zona"]);
  });

  it("una ficha vacía no truena", () => {
    expect(fichaEntries({})).toEqual([]);
  });
});
