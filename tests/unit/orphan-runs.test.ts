import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * FR-034 endurecido: cuando una corrida del Laboratorio queda huérfana (por
 * reinicio —cleanupOrphanRuns al boot— o por fallo en ejecución —failRun),
 * SUS CASOS también salen de pending/running. Si no, la UI del Lab muestra
 * personas "corriendo" para siempre dentro de una corrida que ya no existe
 * en memoria.
 *
 * Estado terminal elegido: judge_failed — el único "sin veredicto" del enum,
 * y computeScore ya lo excluye del denominador: una corrida interrumpida ni
 * infla ni hunde el score histórico.
 */

const state = vi.hoisted(() => ({
  orphanRuns: 1,
  updates: [] as { table: string; set: Record<string, unknown> }[],
}));

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    update: (table: { col?: string }) => ({
      set: (v: Record<string, unknown>) => ({
        // La corrida usa .where().returning(); los casos solo .where() con
        // await directo — el thenable cubre ambos caminos.
        where: () => {
          const name = table.col ?? "?";
          state.updates.push({ table: name, set: v });
          const result =
            name === "agentTestRun"
              ? Array.from({ length: state.orphanRuns }, (_, i) => ({
                  id: `run_orphan_${i}`,
                }))
              : [];
          return {
            returning: () => Promise.resolve(result),
            then: (onF: (r: unknown[]) => unknown) =>
              Promise.resolve(result).then(onF),
          };
        },
      }),
    }),
  }),
  schema: new Proxy(
    {},
    {
      get(_t, prop) {
        return { col: String(prop) };
      },
    }
  ),
}));

vi.mock("drizzle-orm", () => ({
  eq: (a: unknown, b: unknown) => ({ op: "eq", a, b }),
  inArray: (a: unknown, b: unknown) => ({ op: "inArray", a, b }),
}));

import { cleanupOrphanRuns } from "@/instrumentation-node";

describe("cleanupOrphanRuns (FR-034: casos de corridas huérfanas)", () => {
  beforeEach(() => {
    state.updates.length = 0;
    state.orphanRuns = 1;
  });

  it("marca la corrida como fallida y TAMBIÉN sus casos como judge_failed", async () => {
    await cleanupOrphanRuns();

    const tables = state.updates.map((u) => u.table);
    expect(tables).toContain("agentTestRun");

    const run = state.updates.find((u) => u.table === "agentTestRun");
    expect(run?.set.status).toBe("failed");
    expect(run?.set.error).toBe("Interrumpida por un reinicio del servidor");

    const cases = state.updates.find((u) => u.table === "agentTestCase");
    expect(cases?.set.status).toBe("judge_failed");
  });

  it("sin corridas huérfanas no toca casos: el segundo update depende del returning", async () => {
    state.orphanRuns = 0;
    await cleanupOrphanRuns();

    expect(state.updates.map((u) => u.table)).toEqual(["agentTestRun"]);
  });
});
