import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 036 — El interruptor de la pantalla Agente (`agent_profile.enabled`) ya no
 * enciende un agente que viva en el CRM: decide si el CRM le despacha al
 * cerebro. Lo que se protege:
 *
 *   - Con el interruptor apagado, un mensaje real no se despacha: queda en la
 *     bandeja para una persona.
 *   - Encenderlo exige un cerebro configurado y sano (409 `sin_cerebro`):
 *     encendido sin nadie que conteste, el dueño creería que contestan.
 *   - Apagarlo siempre se puede.
 */

const LLAVE = "k".repeat(32);

// Base falsa: cada `select` devuelve la siguiente respuesta de la cola.
const cola = vi.hoisted(() => [] as unknown[][]);
const updates = vi.hoisted(() => [] as unknown[]);
vi.mock("@/lib/db", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/db")>();
  const consulta = () => {
    const q = {
      from: () => q,
      where: () => q,
      limit: () => q,
      then: (ok: (v: unknown[]) => unknown) => Promise.resolve(cola.shift() ?? []).then(ok),
    };
    return q;
  };
  return {
    ...real,
    getDb: () => ({
      select: consulta,
      update: () => ({
        set: (v: unknown) => {
          updates.push(v);
          const w = { where: () => w, returning: async () => [{ id: "agp_1" }] };
          return w;
        },
      }),
    }),
  };
});

const encolarDespacho = vi.hoisted(() => vi.fn(async () => ({ notBefore: new Date() })));
vi.mock("@/server/dispatch/outbox", () => ({
  encolarDespacho,
  ventanaCoalesceMs: () => 3000,
  ventanaLargaMs: () => 8000,
}));
// 078 — El «escribiendo…» al encolar no toca Meta en las unitarias.
const mostrarEscribiendo = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
vi.mock("@/server/whatsapp/escribiendo", () => ({ mostrarEscribiendo }));
vi.mock("@/server/dispatch/worker", () => ({ iniciarWorker: () => {}, programarTanda: () => {} }));

const getBrainHealth = vi.hoisted(() => vi.fn());
vi.mock("@/server/bot/status", () => ({ getBrainHealth }));

vi.mock("@/lib/auth/session", () => ({
  UnauthorizedError: class UnauthorizedError extends Error {},
  requireSession: async () => ({ userId: "usr_1", organizationId: "org_1", role: "owner" }),
  getSessionOrNull: async () => ({ userId: "usr_1", organizationId: "org_1", role: "owner" }),
}));

import { despacharAlCerebro } from "@/server/dispatch/encolar";
import { PUT } from "@/app/api/agent/profile/route";

const CONV_ABIERTA = { aiEnabled: true, handoffAt: null, isTest: false, channel: "whatsapp" };

beforeEach(() => {
  cola.length = 0;
  updates.length = 0;
  encolarDespacho.mockClear();
  mostrarEscribiendo.mockClear();
  getBrainHealth.mockReset();
  vi.stubEnv("BRAIN_DISPATCH_URL", "");
  vi.stubEnv("BRAIN_HEALTH_URL", "");
  vi.stubEnv("BOT_API_KEY", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("el despacho respeta el interruptor", () => {
  it("encendido: se encola el turno y el cliente ve «escribiendo…»", async () => {
    cola.push([CONV_ABIERTA], [{ enabled: true }], [{ type: "text", text: "¿Cuánto cuesta la limpieza?" }]);
    await despacharAlCerebro("cv_1", "org_1", "msg_1");
    expect(encolarDespacho).toHaveBeenCalledWith({
      organizationId: "org_1",
      conversationId: "cv_1",
      messageIds: ["msg_1"],
      ventanaMs: 3000,
    });
    expect(mostrarEscribiendo).toHaveBeenCalledTimes(1);
  });

  it("078 — un «Hola» espera la ventana larga", async () => {
    cola.push([CONV_ABIERTA], [{ enabled: true }], [{ type: "text", text: "Hola" }]);
    await despacharAlCerebro("cv_1", "org_1", "msg_1");
    expect(encolarDespacho).toHaveBeenCalledWith(expect.objectContaining({ ventanaMs: 8000 }));
  });

  it("apagado: no se encola, queda en la bandeja", async () => {
    cola.push([CONV_ABIERTA], [{ enabled: false }]);
    await despacharAlCerebro("cv_1", "org_1", "msg_1");
    expect(encolarDespacho).not.toHaveBeenCalled();
    expect(mostrarEscribiendo).not.toHaveBeenCalled();
  });

  it("sin perfil: no se encola", async () => {
    cola.push([CONV_ABIERTA], []);
    await despacharAlCerebro("cv_1", "org_1", "msg_1");
    expect(encolarDespacho).not.toHaveBeenCalled();
  });

  it("la conversación pausada sigue mandando, aunque el interruptor esté encendido", async () => {
    cola.push([{ ...CONV_ABIERTA, aiEnabled: false }], [{ enabled: true }]);
    await despacharAlCerebro("cv_1", "org_1", "msg_1");
    expect(encolarDespacho).not.toHaveBeenCalled();
  });
});

const encender = (enabled: boolean) =>
  PUT(
    new Request("http://crm.test/api/agent/profile", {
      method: "PUT",
      headers: { "content-type": "application/json", origin: "http://crm.test" },
      body: JSON.stringify({ enabled }),
    })
  );

describe("PUT /api/agent/profile {enabled}", () => {
  it("sin cerebro configurado → 409 sin_cerebro y no se guarda", async () => {
    const res = await encender(true);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("sin_cerebro");
    expect(body.error.message).toMatch(/BRAIN_DISPATCH_URL/);
    expect(updates).toHaveLength(0);
  });

  it("sin BOT_API_KEY → 409 que lo dice", async () => {
    vi.stubEnv("BRAIN_DISPATCH_URL", "http://nea:8000/vocero/dispatch");
    const res = await encender(true);
    expect(res.status).toBe(409);
    expect((await res.json()).error.message).toMatch(/BOT_API_KEY/);
  });

  it("configurado pero el /health no contesta → 409", async () => {
    vi.stubEnv("BRAIN_DISPATCH_URL", "http://nea:8000/vocero/dispatch");
    vi.stubEnv("BOT_API_KEY", LLAVE);
    getBrainHealth.mockResolvedValue({ reachable: false, host: "nea:8000", checkedAt: "", problem: "network" });
    const res = await encender(true);
    expect(res.status).toBe(409);
    expect((await res.json()).error.message).toMatch(/no contesta/);
    expect(getBrainHealth).toHaveBeenCalledWith("http://nea:8000/health");
  });

  it("configurado y sano → se enciende", async () => {
    vi.stubEnv("BRAIN_DISPATCH_URL", "http://nea:8000/vocero/dispatch");
    vi.stubEnv("BOT_API_KEY", LLAVE);
    getBrainHealth.mockResolvedValue({ reachable: true, host: "nea:8000", checkedAt: "" });
    const res = await encender(true);
    expect(res.status).toBe(200);
    expect(updates[0]).toMatchObject({ enabled: true });
  });

  it("apagar siempre se puede, sin preguntarle a nadie", async () => {
    const res = await encender(false);
    expect(res.status).toBe(200);
    expect(updates[0]).toMatchObject({ enabled: false });
    expect(getBrainHealth).not.toHaveBeenCalled();
  });
});
