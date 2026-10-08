import { desc, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import type { AiProviderId } from "@/lib/ai/presets";

/**
 * Registro de llamadas al proveedor de IA (issue #85).
 *
 * Lo escribe el adaptador (`src/lib/ai/index.ts`) una vez por llamada HTTP:
 * proveedor, modelo, duración, tokens que reportó el proveedor y si salió
 * bien. La pestaña Ajustes → IA lo muestra para diagnosticar («¿por qué tarda
 * tanto?», «¿cuánto estoy gastando?»).
 *
 * Invariantes: `organization_id` obligatorio en todo (Constitución III, vía
 * `scoped()`); el registro jamás rompe el turno del agente — si la inserción
 * falla, se traga el error y el turno sigue.
 */

export type UsoTokens = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};

export type NuevaLlamadaIa = {
  organizationId: string;
  provider: AiProviderId;
  baseUrl: string;
  model: string;
  attempt: number;
  ms: number;
  uso: UsoTokens | null;
  ok: boolean;
  error?: string | null;
};

/** Una fila del registro, tal como la ve la UI. */
export type LlamadaIa = {
  id: string;
  provider: AiProviderId;
  baseUrl: string;
  model: string;
  attempt: number;
  ms: number;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  ok: boolean;
  error: string | null;
  createdAt: string;
};

/** Inserta una llamada. Nunca lanza: el registro no puede tumbar el turno. */
export async function registrarLlamadaIa(input: NuevaLlamadaIa): Promise<void> {
  try {
    const db = getDb();
    await db.insert(schema.aiCallLog).values({
      id: newId("aiCallLog"),
      organizationId: input.organizationId,
      provider: input.provider,
      baseUrl: input.baseUrl,
      model: input.model,
      attempt: input.attempt,
      ms: input.ms,
      promptTokens: input.uso?.promptTokens ?? null,
      completionTokens: input.uso?.completionTokens ?? null,
      totalTokens: input.uso?.totalTokens ?? null,
      ok: input.ok,
      error: input.error ?? null,
    });
  } catch {
    // Intencionado: diagnosticar no puede romper el turno del agente.
  }
}

const LIMITE_DEFECTO = 50;
const LIMITE_MAXIMO = 200;

/**
 * Últimas llamadas de la organización, de nuevas a viejas.
 *
 * `cursor` es el `id` de la última fila vista. La comparación por tupla
 * `(created_at, id)` usa la precisión completa del timestamp: no se salta ni
 * se repite ninguna fila aunque lleguen llamadas nuevas entre páginas.
 */
export async function listarLlamadasIa(
  organizationId: string,
  opts?: { limit?: number; cursor?: string }
): Promise<{ items: LlamadaIa[]; nextCursor: string | null }> {
  const limit = Math.min(
    Math.max(opts?.limit ?? LIMITE_DEFECTO, 1),
    LIMITE_MAXIMO
  );
  const db = getDb();
  const col = schema.aiCallLog;

  const cursorCond = opts?.cursor
    ? sql`(${col.createdAt}, ${col.id}) < (SELECT ${col.createdAt}, ${col.id} FROM ${col} WHERE ${col.id} = ${opts.cursor} AND ${col.organizationId} = ${organizationId})`
    : undefined;

  const filas = await db
    .select()
    .from(col)
    .where(scoped(col.organizationId, organizationId, cursorCond))
    .orderBy(desc(col.createdAt), desc(col.id))
    .limit(limit + 1);

  const items: LlamadaIa[] = filas.slice(0, limit).map((f) => ({
    id: f.id,
    provider: f.provider as AiProviderId,
    baseUrl: f.baseUrl,
    model: f.model,
    attempt: f.attempt,
    ms: f.ms,
    promptTokens: f.promptTokens,
    completionTokens: f.completionTokens,
    totalTokens: f.totalTokens,
    ok: f.ok,
    error: f.error,
    createdAt: f.createdAt.toISOString(),
  }));

  const nextCursor =
    filas.length > limit ? items[items.length - 1]!.id : null;
  return { items, nextCursor };
}
