import { afterEach, describe, expect, it, vi } from "vitest";
import { registrarLlamadaIa } from "@/server/ai/call-log";

/**
 * Issue #85 — el registro jamás rompe el turno del agente. Se prueba el
 * módulo REAL (sin mock): con una base inalcanzable, la inserción falla por
 * dentro y la promesa igual se resuelve.
 */
describe("registrarLlamadaIa nunca lanza", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("traga el error si la base no está disponible", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://invalido:1234/nada");
    await expect(
      registrarLlamadaIa({
        organizationId: "org_x",
        provider: "openrouter",
        baseUrl: "https://openrouter.ai/api",
        model: "m",
        attempt: 1,
        ms: 5,
        uso: null,
        ok: true,
      })
    ).resolves.toBeUndefined();
  });
});
