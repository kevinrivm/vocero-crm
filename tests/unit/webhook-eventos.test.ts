import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 047 — Webhook a prueba de fallos: el evento se guarda antes de acusar
 * recibo, un fallo al procesar se reintenta con espera creciente y lo que no
 * se pudo ni guardar se responde 503 para que la fuente reintente.
 */

const { after, guardarEvento, resolverOrganizacion, procesarFuente, procesarEvento } =
  vi.hoisted(() => ({
    after: vi.fn(),
    guardarEvento: vi.fn(),
    resolverOrganizacion: vi.fn(),
    procesarFuente: vi.fn(),
    procesarEvento: vi.fn(),
  }));

vi.mock("next/server", () => ({ after }));
vi.mock("@/server/webhooks/eventos", async (orig) => ({
  ...(await orig<typeof import("@/server/webhooks/eventos")>()),
  guardarEvento,
}));
vi.mock("@/server/webhooks/organizacion", async (orig) => ({
  ...(await orig<typeof import("@/server/webhooks/organizacion")>()),
  resolverOrganizacion,
}));
vi.mock("@/server/webhooks/procesar", () => ({ procesarFuente }));
vi.mock("@/server/webhooks/worker", () => ({ procesarEvento }));

import {
  ESPERAS_MS,
  MAX_INTENTOS,
  esperaDeReintento,
  huellaDe,
  resumenDeError,
} from "@/server/webhooks/eventos";
import { recibirEvento } from "@/server/webhooks/recibir";
import { lanzarFalloDePrueba, programarFallosDePrueba } from "@/server/dev/webhook-fallo";

const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
  vi.clearAllMocks();
});

describe("la espera entre intentos", () => {
  it("30 s, 2 min, 10 min, 1 h y 6 h; el sexto intento ya no espera: se agota", () => {
    expect([1, 2, 3, 4, 5].map(esperaDeReintento)).toEqual([
      30_000, 120_000, 600_000, 3_600_000, 21_600_000,
    ]);
    expect(MAX_INTENTOS).toBe(ESPERAS_MS.length + 1);
  });

  it("fuera de rango se queda en los extremos", () => {
    expect(esperaDeReintento(0)).toBe(30_000);
    expect(esperaDeReintento(99)).toBe(21_600_000);
  });
});

describe("huella del cuerpo", () => {
  it("es estable y distingue un byte", () => {
    const a = '{"entry":[{"id":"1"}]}';
    expect(huellaDe(a)).toBe(huellaDe(a));
    expect(huellaDe(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(huellaDe(a)).not.toBe(huellaDe('{"entry":[{"id":"2"}]}'));
  });
});

describe("el error que se guarda", () => {
  it("es el mensaje recortado a 300 caracteres, nunca otra cosa", () => {
    expect(resumenDeError(new Error("x".repeat(500)))).toHaveLength(300);
    expect(resumenDeError("texto")).toBe("texto");
    expect(resumenDeError(new Error(""))).toBe("error desconocido");
  });
});

describe("a qué organización va cada evento", () => {
  const org = (id: string) => async (x: string) => (x === id ? { organizationId: "org_a" } : null);
  const nadie = async () => null;
  const b = {
    porPhoneNumberId: org("PNID"),
    porWabaId: org("WABA"),
    porIgUserId: org("IG1"),
    porPageId: org("PAGE1"),
    porCuentaZernio: async () => ({ organizationId: "org_z" }),
  };

  it("WhatsApp por phone_number_id, y por WABA para los estados de plantillas", async () => {
    const { resolverOrganizacion: real } = await vi.importActual<
      typeof import("@/server/webhooks/organizacion")
    >("@/server/webhooks/organizacion");
    const mensajes = { entry: [{ id: "WABA", changes: [{ field: "messages", value: { metadata: { phone_number_id: "PNID" } } }] }] };
    expect(await real("whatsapp", mensajes, b)).toBe("org_a");
    const plantillas = { entry: [{ id: "WABA", changes: [{ field: "message_template_status_update", value: {} }] }] };
    expect(await real("whatsapp", plantillas, b)).toBe("org_a");
    expect(await real("whatsapp", { entry: [{ id: "otra" }] }, { ...b, porWabaId: nadie })).toBeNull();
  });

  it("Instagram y Messenger de Meta, y Zernio por su cuenta", async () => {
    const { resolverOrganizacion: real } = await vi.importActual<
      typeof import("@/server/webhooks/organizacion")
    >("@/server/webhooks/organizacion");
    expect(await real("meta_instagram", { object: "instagram", entry: [{ id: "IG1" }] }, b)).toBe("org_a");
    const pagina = {
      object: "page",
      entry: [{ id: "PAGE1", messaging: [{ sender: { id: "PSID" }, message: { mid: "m1", text: "hola" } }] }],
    };
    expect(await real("meta_messenger", pagina, b)).toBe("org_a");
    expect(await real("zernio", { account: { id: "acc" } }, b)).toBe("org_z");
    expect(await real("meta_instagram", { entry: [{ id: "otro" }] }, b)).toBeNull();
  });
});

describe("recibirEvento: lo que hace la ruta tras validar", () => {
  it("guarda, responde 200 y procesa fuera de la ruta", async () => {
    resolverOrganizacion.mockResolvedValue("org_a");
    guardarEvento.mockResolvedValue({ id: "whe_1", nuevo: true });
    const res = await recibirEvento("whatsapp", { entry: [] }, "{}", "webhook");
    expect(res.status).toBe(200);
    expect(guardarEvento).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org_a", fuente: "whatsapp", rawBody: "{}" })
    );
    expect(after).toHaveBeenCalledTimes(1);
    await after.mock.calls[0]![0]();
    expect(procesarEvento).toHaveBeenCalledWith("whe_1");
  });

  it("si no se pudo guardar, 503 y no procesa nada: reintenta quien mandó", async () => {
    resolverOrganizacion.mockResolvedValue("org_a");
    guardarEvento.mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await recibirEvento("whatsapp", {}, "{}", "webhook");
    expect(res.status).toBe(503);
    expect(after).not.toHaveBeenCalled();
  });

  it("si resolver la organización falla (base caída), también 503", async () => {
    resolverOrganizacion.mockRejectedValue(new Error("ECONNREFUSED"));
    expect((await recibirEvento("zernio", {}, "{}", "tiktok")).status).toBe(503);
  });

  it("la misma entrega dos veces no se procesa dos veces", async () => {
    resolverOrganizacion.mockResolvedValue("org_a");
    guardarEvento.mockResolvedValue({ id: "whe_1", nuevo: false });
    const res = await recibirEvento("whatsapp", {}, "{}", "webhook");
    expect(res.status).toBe(200);
    expect(after).not.toHaveBeenCalled();
  });

  it("sin organización no se guarda: se procesa como antes (la ingesta lo descarta con su aviso)", async () => {
    resolverOrganizacion.mockResolvedValue(null);
    const res = await recibirEvento("meta_instagram", { entry: [] }, "{}", "ig");
    expect(res.status).toBe(200);
    expect(guardarEvento).not.toHaveBeenCalled();
    await after.mock.calls[0]![0]();
    expect(procesarFuente).toHaveBeenCalledWith("meta_instagram", { entry: [] });
  });
});

describe("el fallo de prueba del arnés", () => {
  beforeEach(() => programarFallosDePrueba(0));

  it("no hace nada sin mocks, aunque se haya programado", () => {
    process.env.WA_MOCK_ENABLED = "false";
    programarFallosDePrueba(3);
    expect(() => lanzarFalloDePrueba()).not.toThrow();
  });

  it("con mocks lanza las veces pedidas y luego deja pasar", () => {
    process.env.WA_MOCK_ENABLED = "true";
    programarFallosDePrueba(2);
    expect(() => lanzarFalloDePrueba()).toThrow(/fallo de prueba/);
    expect(() => lanzarFalloDePrueba()).toThrow(/fallo de prueba/);
    expect(() => lanzarFalloDePrueba()).not.toThrow();
  });
});

describe("guardarraíl: ninguna ruta de webhook procesa por su cuenta", () => {
  function rutas(dir: string): string[] {
    const out: string[] = [];
    for (const e of readdirSync(dir)) {
      const full = join(dir, e);
      if (statSync(full).isDirectory()) out.push(...rutas(full));
      else if (e === "route.ts") out.push(full);
    }
    return out;
  }

  it("las cuatro pasan por recibirEvento y ninguna usa after() directo", () => {
    const archivos = rutas(join(process.cwd(), "src", "app", "api", "webhooks")).filter(
      (f) => !f.includes("evolution")
    );
    expect(archivos.length).toBeGreaterThanOrEqual(4);
    for (const f of archivos) {
      const src = readFileSync(f, "utf8");
      // Un after() suelto en una ruta es justo lo que perdía mensajes.
      expect(src, f).not.toMatch(/\bafter\(/);
      expect(src, f).toContain("recibirEvento(");
    }
  });
});
