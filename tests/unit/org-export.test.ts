import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Export de datos por organización ("tus datos son tuyos"):
 * - incluye contactos, leads, conversaciones REALES con mensajes, citas y
 *   corridas del Lab;
 * - excluye contactos archivados (los sintéticos del Laboratorio) y las
 *   conversaciones is_test;
 * - nunca consulta tablas de credenciales: el mock de schema REVIENTA si el
 *   export intenta tocarlas — la privacidad se prueba por construcción.
 */

const tables = vi.hoisted(() => new Map<string, Record<string, unknown>[]>());

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: (t: { col?: string }) => ({
        where: () => ({
          orderBy: () => Promise.resolve(tables.get(t.col ?? "?") ?? []),
        }),
      }),
    }),
  }),
  schema: new Proxy(
    {},
    {
      get(_t, prop) {
        const name = String(prop);
        if (/credentials/i.test(name)) {
          throw new Error(`el export NO debe tocar la tabla ${name}`);
        }
        return { col: name };
      },
    }
  ),
}));

vi.mock("drizzle-orm", () => ({
  eq: (a: unknown, b: unknown) => ({ op: "eq", a, b }),
  inArray: (a: unknown, b: unknown) => ({ op: "inArray", a, b }),
  asc: (c: unknown) => ({ asc: c }),
}));

vi.mock("@/lib/db/tenant", () => ({
  scoped: (col: unknown, org: string) => ({ op: "scoped", col, org }),
}));

import { buildOrganizationExport } from "@/server/export/org-export";

const d = (n: number) => new Date(Date.UTC(2026, 7, n));

describe("buildOrganizationExport", () => {
  beforeEach(() => {
    tables.clear();
  });

  it("arma el dump completo y excluye lo sintético del Laboratorio", async () => {
    tables.set("pipelineStage", [
      { id: "st_new", name: "Nuevo", position: 0 },
    ]);
    tables.set("contact", [
      { id: "ct_1", name: "Ana", phone: "57300111", waIdentity: "57300111", channel: "whatsapp", notes: null, ficha: null, archivedAt: null, createdAt: d(1) },
      // contacto sintético del Lab (archivado): NO debe salir
      { id: "ct_test", name: "[Prueba] Comprador", phone: "5210000000001", waIdentity: "5210000000001", channel: "whatsapp", notes: null, ficha: null, archivedAt: d(2), createdAt: d(2) },
    ]);
    tables.set("lead", [
      { id: "ld_1", contactId: "ct_1", stageId: "st_new", amountCents: 150000, currency: "COP", priority: "alta", createdAt: d(1) },
    ]);
    tables.set("conversation", [
      { id: "cv_1", contactId: "ct_1", channel: "whatsapp", aiEnabled: true, handoffReason: null, isTest: false, createdAt: d(1) },
      // conversación de prueba: NO debe salir (ni consultar sus mensajes)
      { id: "cv_test", contactId: "ct_test", channel: "whatsapp", aiEnabled: true, handoffReason: null, isTest: true, createdAt: d(2) },
    ]);
    tables.set("message", [
      { id: "m1", conversationId: "cv_1", direction: "in", type: "text", text: "hola", status: "delivered", waTimestamp: d(1), createdAt: d(1) },
    ]);
    tables.set("booking", [
      { id: "bk_1", conversationId: "cv_1", kind: "session", scheduledAt: d(3), status: "agendada", createdAt: d(1) },
    ]);
    tables.set("agentTestRun", [
      { id: "run_1", status: "done", score: 83, startedAt: d(1), finishedAt: d(1) },
    ]);

    const dump = await buildOrganizationExport("org_1");

    expect(dump.version).toBe(1);
    expect(dump.contacts.map((c) => c.id)).toEqual(["ct_1"]);
    expect(dump.leads[0]?.stage).toBe("Nuevo"); // nombre de etapa, no id
    expect(dump.leads[0]?.amountCents).toBe(150000);
    expect(dump.conversations.map((c) => c.id)).toEqual(["cv_1"]);
    expect(dump.conversations[0]?.messages[0]?.text).toBe("hola");
    expect(dump.bookings[0]?.status).toBe("agendada");
    expect(dump.labRuns[0]?.score).toBe(83);
    expect(typeof dump.exportedAt).toBe("string");
  });

  it("sin conversaciones reales no consulta mensajes y devuelve vacíos", async () => {
    for (const t of ["pipelineStage", "contact", "lead", "conversation", "booking", "agentTestRun"]) {
      tables.set(t, []);
    }
    // La tabla message solo se consulta si hay conversaciones reales:
    tables.set("message", []);
    const dump = await buildOrganizationExport("org_x");
    expect(dump.conversations).toEqual([]);
    expect(dump.contacts).toEqual([]);
  });
});
