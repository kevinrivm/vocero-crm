import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";

/**
 * 069 — Llaves de la API pública v1 (se crean en Ajustes → API).
 *
 * Una llave es `vk_` + 40 caracteres aleatorios (240 bits). Con esa entropía
 * un sha256 sin sal basta para guardarla: no hay diccionario que probar, y
 * buscar por hash exacto evita comparar contra todas las llaves.
 */

/**
 * `configure` va aparte de `operate`: cambia cómo le habla el agente a TODOS
 * los clientes a la vez, así que una llave de n8n que mueve leads no lo lleva.
 */
export const API_SCOPES = ["read", "operate", "send", "configure"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export const PREFIJO_LLAVE = "vk_";

export function hashLlave(valor: string): string {
  return createHash("sha256").update(valor).digest("hex");
}

export function generarLlave(): { valor: string; prefix: string; last4: string; hash: string } {
  const valor = PREFIJO_LLAVE + randomBytes(30).toString("base64url");
  return { valor, prefix: valor.slice(0, 10), last4: valor.slice(-4), hash: hashLlave(valor) };
}

/** `send` sin `operate` no tiene sentido: mandar un mensaje es operar. */
export function normalizarScopes(scopes: readonly ApiScope[]): ApiScope[] {
  const set = new Set<ApiScope>(["read", ...scopes]);
  if (set.has("send")) set.add("operate");
  return API_SCOPES.filter((s) => set.has(s));
}

export type LlaveVisible = {
  id: string;
  name: string;
  prefix: string;
  last4: string;
  scopes: ApiScope[];
  createdAt: string;
  lastUsedAt: string | null;
  requestCount: number;
};

function visible(r: typeof schema.apiKey.$inferSelect): LlaveVisible {
  return {
    id: r.id,
    name: r.name,
    prefix: r.prefix,
    last4: r.last4,
    scopes: r.scopes.filter((s): s is ApiScope => (API_SCOPES as readonly string[]).includes(s)),
    createdAt: r.createdAt.toISOString(),
    lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
    requestCount: r.requestCount,
  };
}

export async function listarLlaves(organizationId: string): Promise<LlaveVisible[]> {
  const rows = await getDb()
    .select()
    .from(schema.apiKey)
    .where(scoped(schema.apiKey.organizationId, organizationId, isNull(schema.apiKey.revokedAt)))
    .orderBy(desc(schema.apiKey.createdAt));
  return rows.map(visible);
}

/** Tope por organización: más llaves no es más útil, es más superficie. */
export const MAX_LLAVES = 10;

export async function crearLlave(input: {
  organizationId: string;
  userId: string;
  name: string;
  scopes: ApiScope[];
}): Promise<{ llave: LlaveVisible; valor: string } | { error: "limite" }> {
  const activas = await listarLlaves(input.organizationId);
  if (activas.length >= MAX_LLAVES) return { error: "limite" };
  const g = generarLlave();
  const [row] = await getDb()
    .insert(schema.apiKey)
    .values({
      id: newId("apiKey"),
      organizationId: input.organizationId,
      name: input.name,
      prefix: g.prefix,
      last4: g.last4,
      hash: g.hash,
      scopes: normalizarScopes(input.scopes),
      createdByUserId: input.userId,
    })
    .returning();
  return { llave: visible(row!), valor: g.valor };
}

export async function revocarLlave(organizationId: string, id: string): Promise<boolean> {
  const rows = await getDb()
    .update(schema.apiKey)
    .set({ revokedAt: new Date() })
    .where(
      scoped(schema.apiKey.organizationId, organizationId, eq(schema.apiKey.id, id), isNull(schema.apiKey.revokedAt))
    )
    .returning({ id: schema.apiKey.id });
  return rows.length > 0;
}

/** La llave viva de un valor presentado, o null. No mira la organización. */
export async function llavePorValor(valor: string) {
  if (!valor.startsWith(PREFIJO_LLAVE) || valor.length < 20 || valor.length > 100) return null;
  const rows = await getDb()
    .select()
    .from(schema.apiKey)
    .where(and(eq(schema.apiKey.hash, hashLlave(valor)), isNull(schema.apiKey.revokedAt)))
    .limit(1);
  return rows[0] ?? null;
}
