import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * FR-022: cuando el patrón de respaldo detecta que el cliente pide una persona,
 * el turno envía un acuse ANTES de aplicar el handoff. Antes no enviaba nada y
 * la conversación quedaba en silencio, al contrario del camino del modelo, que
 * ya se despide con `action.farewell`.
 */

const graphRequest = vi.fn();
const chatJson = vi.fn();

vi.mock("@/lib/meta/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/meta/client")>();
  return { ...original, graphRequest };
});

vi.mock("@/lib/ai", () => ({ chatJson }));

// BD simulada: cola de resultados de select + capturas de insert/update.
const selectQueue: unknown[][] = [];
const inserts: { table: unknown; values: unknown }[] = [];

function thenableChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "where", "orderBy", "limit"]) {
    chain[m] = () => chain;
  }
  (chain as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    Promise.resolve(rows).then(resolve);
  return chain;
}

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => thenableChain(selectQueue.shift() ?? []),
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        inserts.push({ table, values });
        const chain = {
          onConflictDoNothing: () => chain,
          returning: () => Promise.resolve([values]),
          then: (resolve: (v: unknown) => void) =>
            Promise.resolve([values]).then(resolve),
        };
        return chain;
      },
    }),
    update: () => ({
      set: () => ({
        where: () => {
          const chain = {
            returning: () => Promise.resolve([{}]),
            then: (resolve: (v: unknown) => void) =>
              Promise.resolve([{}]).then(resolve),
          };
          return chain;
        },
      }),
    }),
  }),
  schema: new Proxy(
    {},
    {
      get: (_t, tableName) =>
        new Proxy(
          {},
          { get: (_t2, col) => `${String(tableName)}.${String(col)}` }
        ),
    }
  ),
}));

describe("acuse del patrón de respaldo de handoff (FR-022)", () => {
  beforeEach(() => {
    graphRequest.mockReset();
    chatJson.mockReset();
    selectQueue.length = 0;
    inserts.length = 0;
    vi.stubEnv("OPENROUTER_API_TOKEN", "token-test");
  });

  it("el cliente pide un humano → recibe acuse y NO se consulta al modelo", async () => {
    selectQueue.push(
      [
        {
          id: "cv_1",
          organizationId: "org_1",
          contactId: "ct_1",
          isTest: true,
          aiEnabled: true,
          handoffAt: null,
          handoffReason: null,
          lastInboundAt: new Date(),
        },
      ], // conversación
      [
        {
          id: "agp_1",
          organizationId: "org_1",
          enabled: true,
          name: "Asistente",
          tone: null,
          instructions: null,
          escalationRules: null,
          greeting: null,
        },
      ], // perfil
      [
        {
          id: "msg_1",
          direction: "in",
          text: "quiero hablar con un humano",
          createdAt: new Date(),
        },
      ] // historial
    );

    const { runAgentTurn } = await import("@/server/ai/pipeline");
    await runAgentTurn("cv_1");

    // el patrón de respaldo corta antes del LLM
    expect(chatJson).not.toHaveBeenCalled();
    expect(graphRequest).not.toHaveBeenCalled();

    // …pero el cliente sí recibe un mensaje
    const saliente = inserts.find(
      (i) =>
        typeof i.values === "object" &&
        i.values !== null &&
        (i.values as { direction?: string }).direction === "out"
    );
    expect(saliente).toBeDefined();
    expect((saliente!.values as { text: string }).text).toMatch(/persona del equipo/);
    expect((saliente!.values as { aiGenerated: boolean }).aiGenerated).toBe(true);
  });
});
