import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { chatJson } from "@/lib/ai";
import type { NuevaLlamadaIa } from "@/server/ai/call-log";
import type { AiCredentialSecret } from "@/server/ai/credentials";

/**
 * Issue #85 — registro de llamadas. El adaptador anota cada intento contra
 * el proveedor (proveedor, modelo, ms, tokens, ok) sin romper el turno.
 * La escritura real se captura; la fila de credenciales se simula.
 */
const { llamadas } = vi.hoisted(() => ({
  llamadas: [] as NuevaLlamadaIa[],
}));

vi.mock("@/server/ai/call-log", () => ({
  registrarLlamadaIa: async (input: NuevaLlamadaIa) => {
    llamadas.push(input);
  },
  listarLlamadasIa: async () => ({ items: [], nextCursor: null }),
}));

const { fila } = vi.hoisted(() => ({
  fila: { current: null as AiCredentialSecret | null },
}));

vi.mock("@/server/ai/credentials", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/server/ai/credentials")>();
  return {
    ...original,
    getAiCredentialSecret: async () => fila.current,
    getAiCredentialPublic: async () => fila.current,
    marcarEstadoPorRespuesta: async () => false,
  };
});

const FILA_ORG: AiCredentialSecret = {
  provider: "openai_compatible",
  baseUrl: "https://proveedor.test/v1",
  model: "org/modelo",
  tokenLast4: "1234",
  status: "active",
  statusReason: null,
  statusChangedAt: null,
  updatedAt: new Date(),
token: "llave-de-prueba",
};

describe("registro de llamadas (issue #85)", () => {
  const schema = z.object({ action: z.literal("reply"), text: z.string() });

  beforeEach(() => {
    vi.stubEnv("APP_BASE_URL", "http://localhost:3000");
    vi.stubEnv("DATABASE_URL", "postgresql://t:t@localhost:5432/t");
    vi.stubEnv("BETTER_AUTH_SECRET", "secret-de-test-suficiente");
    vi.stubEnv("ENCRYPTION_KEY", Buffer.alloc(32, 3).toString("base64"));
    vi.stubEnv("META_WEBHOOK_VERIFY_TOKEN", "verify-test");
    vi.stubEnv("OPENROUTER_API_TOKEN", "token-test");
    vi.stubEnv("OPENROUTER_MODEL", "modelo-test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    fila.current = null;
    llamadas.length = 0;
  });

  function respuestaOk(content: string, uso?: object) {
    return new Response(
      JSON.stringify({
        choices: [{ message: { content } }],
        ...(uso ? { usage: uso } : {}),
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }

  it("anota la llamada con proveedor, modelo, ms, tokens y ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        respuestaOk('{"action":"reply","text":"ok"}', {
          prompt_tokens: 120,
          completion_tokens: 30,
          total_tokens: 150,
        })
      )
    );

    const result = await chatJson(
      schema,
      [{ role: "user", content: "hola" }],
      { organizationId: "org_1" }
    );
    expect(result.ok).toBe(true);
    expect(llamadas).toHaveLength(1);
    const l = llamadas[0]!;
    expect(l.organizationId).toBe("org_1");
    expect(l.provider).toBe("openrouter");
    expect(l.model).toBe("modelo-test");
    expect(l.attempt).toBe(1);
    expect(l.ok).toBe(true);
    expect(typeof l.ms).toBe("number");
    expect(l.uso).toEqual({
      promptTokens: 120,
      completionTokens: 30,
      totalTokens: 150,
    });
  });

  it("usa el preset de la fila de la organización, no el del entorno", async () => {
    fila.current = FILA_ORG;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(respuestaOk('{"action":"reply","text":"ok"}'))
    );

    await chatJson(schema, [{ role: "user", content: "hola" }], {
      organizationId: "org_1",
    });
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]!.provider).toBe("openai_compatible");
    expect(llamadas[0]!.model).toBe("org/modelo");
  });

  it("los reintentos quedan visibles con su número de intento", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementationOnce(() => Promise.resolve(new Response("boom", { status: 500 })))
        .mockImplementationOnce(() =>
          Promise.resolve(respuestaOk('{"action":"reply","text":"ok"}'))
        )
    );

    const result = await chatJson(
      schema,
      [{ role: "user", content: "hola" }],
      { organizationId: "org_1" }
    );
    expect(result.ok).toBe(true);
    expect(llamadas).toHaveLength(2);
    expect(llamadas[0]).toMatchObject({ attempt: 1, ok: false });
    expect(llamadas[1]).toMatchObject({ attempt: 2, ok: true });
    expect(llamadas[0]!.error).toContain("500");
  });

  it("sin organizationId no anota nada", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(respuestaOk('{"action":"reply","text":"ok"}'))
    );

    const result = await chatJson(schema, [{ role: "user", content: "hola" }]);
    expect(result.ok).toBe(true);
    expect(llamadas).toHaveLength(0);
  });

  it("si el proveedor no reporta uso, los tokens van en null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(respuestaOk('{"action":"reply","text":"ok"}'))
    );

    await chatJson(schema, [{ role: "user", content: "hola" }], {
      organizationId: "org_1",
    });
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]!.uso).toBeNull();
  });
});
