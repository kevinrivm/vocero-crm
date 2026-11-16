import { normalizeMx } from "@/lib/meta/client";

/**
 * Importación de contactos desde un CSV: la parte PURA.
 *
 * La usan los dos lados: el diálogo, para enseñar qué se va a importar antes
 * de mandar nada, y el endpoint, que vuelve a validar porque no confía en lo
 * que diga el navegador. Con una sola copia, lo que el dueño ve en la vista
 * previa es exactamente lo que el servidor acepta.
 */

export const IMPORT_MAX_ROWS = 2000;

export type ImportRow = { name: string; phone: string };

export type ImportProblem = {
  /** Renglón del archivo, contando el encabezado como 1. */
  line: number;
  name: string;
  reason: "sin_telefono" | "sin_codigo_pais" | "telefono_invalido" | "repetido";
};

export const PROBLEM_LABELS: Record<ImportProblem["reason"], string> = {
  sin_telefono: "sin teléfono",
  sin_codigo_pais: "le falta el código de país",
  telefono_invalido: "teléfono inválido",
  repetido: "repetido en el archivo",
};

/**
 * CSV a tabla. Soporta comillas, comillas dobles escapadas, saltos de línea
 * dentro de un campo, y `;` o tabulador como separador (Excel en español
 * exporta con `;`).
 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [",", ";", "\t"]
    .map((d) => ({ d, n: firstLine.split(d).length }))
    .sort((a, b) => b.n - a.n)[0]!.d;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const plain = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

const PHONE_HEADERS = ["telefono", "telefone", "phone", "whatsapp", "celular", "movil", "numero", "tel"];
const NAME_HEADERS = ["nombre", "nome", "name", "contacto", "contato", "first name", "firstname"];
const SURNAME_HEADERS = ["apellido", "apellidos", "sobrenome", "last name", "lastname"];

/**
 * Qué columna es cuál, por el encabezado. Devuelve null si no hay columna de
 * teléfono: sin ella no hay nada que importar, y adivinarla por el contenido
 * acabaría importando una columna de montos como teléfonos.
 */
export function detectColumns(
  header: string[]
): { name: number; surname: number | null; phone: number } | null {
  const cols = header.map(plain);
  const find = (candidates: string[]) => {
    const exact = cols.findIndex((c) => candidates.includes(c));
    if (exact >= 0) return exact;
    return cols.findIndex((c) => candidates.some((k) => c.startsWith(k)));
  };
  const phone = find(PHONE_HEADERS);
  const name = find(NAME_HEADERS);
  if (phone < 0 || name < 0 || phone === name) return null;
  const surname = find(SURNAME_HEADERS);
  return { name, surname: surname >= 0 && surname !== name ? surname : null, phone };
}

/**
 * Teléfono a identidad de WhatsApp, o el motivo por el que no sirve.
 *
 * Exige código de país igual que el alta manual: diez dígitos son un número
 * local en varios países, y asumir uno produciría un contacto que jamás casa
 * con quien escriba después.
 */
export function normalizeImportPhone(
  raw: string
): { ok: true; phone: string } | { ok: false; reason: ImportProblem["reason"] } {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return { ok: false, reason: "sin_telefono" };
  if (digits.length > 15) return { ok: false, reason: "telefono_invalido" };
  if (digits.length < 11) return { ok: false, reason: "sin_codigo_pais" };
  return { ok: true, phone: normalizeMx(digits) };
}

/** Filas crudas a filas importables + lo que se quedó fuera y por qué. */
export function prepareImport(rows: { name: string; phone: string }[]): {
  valid: ImportRow[];
  problems: ImportProblem[];
} {
  const valid: ImportRow[] = [];
  const problems: ImportProblem[] = [];
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const line = i + 2;
    const name = r.name.replace(/\s+/g, " ").trim().slice(0, 120);
    const res = normalizeImportPhone(r.phone);
    if (!res.ok) {
      problems.push({ line, name, reason: res.reason });
      return;
    }
    if (seen.has(res.phone)) {
      problems.push({ line, name, reason: "repetido" });
      return;
    }
    seen.add(res.phone);
    // Sin nombre se importa igual, con el teléfono como nombre: es lo mismo
    // que hace la ingesta cuando alguien escribe sin nombre de perfil.
    valid.push({ name: name || res.phone, phone: res.phone });
  });
  return { valid, problems };
}

/** Del texto del archivo a filas listas, o el motivo por el que no se pudo leer. */
export function readImportFile(
  text: string
):
  | { ok: true; valid: ImportRow[]; problems: ImportProblem[]; total: number }
  | { ok: false; error: string } {
  const table = parseCsv(text);
  if (table.length < 2) {
    return { ok: false, error: "El archivo está vacío o solo trae el encabezado." };
  }
  const cols = detectColumns(table[0]!);
  if (!cols) {
    return {
      ok: false,
      error:
        "No encontré las columnas. El archivo necesita una columna «nombre» y una «telefono» en el primer renglón.",
    };
  }
  const body = table.slice(1);
  if (body.length > IMPORT_MAX_ROWS) {
    return {
      ok: false,
      error: `El archivo trae ${body.length} renglones; el máximo por importación es ${IMPORT_MAX_ROWS}.`,
    };
  }
  const rows = body.map((r) => ({
    name: [r[cols.name], cols.surname !== null ? r[cols.surname] : ""]
      .map((v) => (v ?? "").trim())
      .filter(Boolean)
      .join(" "),
    phone: r[cols.phone] ?? "",
  }));
  return { ok: true, ...prepareImport(rows), total: body.length };
}
