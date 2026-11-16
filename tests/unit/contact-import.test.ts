import { describe, expect, it } from "vitest";
import {
  detectColumns,
  normalizeImportPhone,
  parseCsv,
  prepareImport,
  readImportFile,
} from "@/lib/contact-import";

describe("parseCsv", () => {
  it("respeta comillas, comas dentro de un campo y BOM", () => {
    const rows = parseCsv('﻿nombre,telefono\r\n"Pérez, Ana",5215512345678\r\n');
    expect(rows).toEqual([
      ["nombre", "telefono"],
      ["Pérez, Ana", "5215512345678"],
    ]);
  });

  it("detecta el punto y coma de Excel en español", () => {
    expect(parseCsv("nombre;telefono\nAna;573001234567")).toEqual([
      ["nombre", "telefono"],
      ["Ana", "573001234567"],
    ]);
  });

  it("descarta renglones vacíos", () => {
    expect(parseCsv("nombre,telefono\n\n,\nAna,573001234567\n")).toHaveLength(2);
  });
});

describe("detectColumns", () => {
  it("encuentra nombre, apellido y teléfono sin importar acentos ni mayúsculas", () => {
    expect(detectColumns(["Nombre", "Apellido", "Email", "Teléfono"])).toEqual({
      name: 0,
      surname: 1,
      phone: 3,
    });
  });

  it("reconoce encabezados comunes en portugués (Nome, Sobrenome, Telefone)", () => {
    expect(detectColumns(["Nome", "Sobrenome", "E-mail", "Telefone"])).toEqual({
      name: 0,
      surname: 1,
      phone: 3,
    });
  });

  it("sin columna de teléfono no adivina", () => {
    expect(detectColumns(["nombre", "monto"])).toBeNull();
  });
});

describe("normalizeImportPhone", () => {
  it("normaliza el 521 de México igual que la ingesta", () => {
    expect(normalizeImportPhone("+52 1 55 1234 5678")).toEqual({
      ok: true,
      phone: "525512345678",
    });
  });

  it("rechaza un número local: sin código de país nunca casaría con quien escriba", () => {
    expect(normalizeImportPhone("55 1234 5678")).toEqual({
      ok: false,
      reason: "sin_codigo_pais",
    });
  });

  it("distingue vacío de inválido", () => {
    expect(normalizeImportPhone("")).toEqual({ ok: false, reason: "sin_telefono" });
    expect(normalizeImportPhone("1234567890123456")).toEqual({
      ok: false,
      reason: "telefono_invalido",
    });
  });
});

describe("prepareImport", () => {
  it("quita repetidos aunque vengan escritos distinto", () => {
    const { valid, problems } = prepareImport([
      { name: "Ana", phone: "5215512345678" },
      { name: "Ana otra vez", phone: "+52 55 1234 5678" },
    ]);
    expect(valid).toEqual([{ name: "Ana", phone: "525512345678" }]);
    expect(problems).toEqual([{ line: 3, name: "Ana otra vez", reason: "repetido" }]);
  });

  it("sin nombre usa el teléfono, como la ingesta", () => {
    expect(prepareImport([{ name: "  ", phone: "573001234567" }]).valid).toEqual([
      { name: "573001234567", phone: "573001234567" },
    ]);
  });
});

describe("readImportFile", () => {
  it("une nombre y apellido y reporta lo que se queda fuera con su renglón", () => {
    const read = readImportFile(
      "nombre,apellido,email,telefono,pais\nAna,Pérez,a@x.com,573001234567,CO\nLuis,Ruiz,l@x.com,,MX\n"
    );
    expect(read).toEqual({
      ok: true,
      total: 2,
      valid: [{ name: "Ana Pérez", phone: "573001234567" }],
      problems: [{ line: 3, name: "Luis Ruiz", reason: "sin_telefono" }],
    });
  });

  it("explica qué columnas faltan en vez de importar basura", () => {
    const read = readImportFile("a,b\n1,2\n");
    expect(read.ok).toBe(false);
  });
});
