import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 069 — `POST /api/v1/templates/send`.
 *
 * Lo que de verdad importa aquí es `porElEquipo`. Es un booleano, y si se
 * invierte nadie se entera hasta que un cobro automático sale, el cliente
 * contesta y el agente está en pausa porque el CRM creyó que lo había mandado
 * una persona. Por eso las dos puertas se prueban por separado.
 */

const llamadas = vi.hoisted(() => ({
  responder: [] as unknown[],
  abrir: [] as unknown[],
  error: null as null | Error,
}));

vi.mock("@/server/plantillas/enviar", async (orig) => {
  const real = await orig<typeof import("@/server/plantillas/enviar")>();
  return {
    ...real,
    responderConPlantilla: async (input: unknown) => {
      llamadas.responder.push(input);
      if (llamadas.error) throw llamadas.error;
      return { messageId: "wamid.X", conversationId: "cv_1" };
    },
    abrirConPlantilla: async (input: unknown) => {
      llamadas.abrir.push(input);
      if (llamadas.error) throw llamadas.error;
      return { messageId: "wamid.Y", conversationId: "cv_2" };
    },
  };
});

import { DestinoError } from "@/server/plantillas/enviar";
import { POST as enviarPlantilla } from "@/server/http/templates-send";

const sesion = { organizationId: "org_1", userId: "u_1", role: "owner" } as never;

function pedir(body: unknown): Request {
  return new Request("http://t/api/v1/templates/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  llamadas.responder = [];
  llamadas.abrir = [];
  llamadas.error = null;
});

describe("POST /api/v1/templates/send", () => {
  it("con conversationId: responde en el hilo y NO marca que la mandó el equipo", async () => {
    const res = await enviarPlantilla(sesion, pedir({ conversationId: "cv_1", templateId: "tpl_1" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ messageId: "wamid.X", conversationId: "cv_1" });
    expect(llamadas.responder).toHaveLength(1);
    expect(llamadas.responder[0]).toMatchObject({
      organizationId: "org_1",
      conversationId: "cv_1",
      porElEquipo: false,
    });
  });

  it("con contactId: abre la conversación, también sin marcar al equipo", async () => {
    const res = await enviarPlantilla(
      sesion,
      pedir({ contactId: "ct_1", templateId: "tpl_1", variables: ["Ads", "01-12-26"] })
    );
    expect(res.status).toBe(200);
    expect(llamadas.abrir[0]).toMatchObject({
      contactId: "ct_1",
      variables: ["Ads", "01-12-26"],
      porElEquipo: false,
    });
  });

  it("sin destino: 422 y no manda nada", async () => {
    const res = await enviarPlantilla(sesion, pedir({ templateId: "tpl_1" }));
    expect(res.status).toBe(422);
    expect(llamadas.responder).toHaveLength(0);
    expect(llamadas.abrir).toHaveLength(0);
  });

  it("con los dos destinos: 422 (uno de los dos, no ambos)", async () => {
    const res = await enviarPlantilla(
      sesion,
      pedir({ conversationId: "cv_1", contactId: "ct_1", templateId: "tpl_1" })
    );
    expect(res.status).toBe(422);
    expect(llamadas.responder).toHaveLength(0);
    expect(llamadas.abrir).toHaveLength(0);
  });

  it("la ventana abierta sale como 409 window_open, con su código", async () => {
    llamadas.error = new DestinoError("window_open", 409, "te escribió hace menos de 24 h");
    const res = await enviarPlantilla(sesion, pedir({ contactId: "ct_1", templateId: "tpl_1" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("window_open");
  });

  it("un contacto que no existe sale como 404, no como 500", async () => {
    llamadas.error = new DestinoError("not_found", 404, "Contacto no encontrado");
    const res = await enviarPlantilla(sesion, pedir({ contactId: "ct_X", templateId: "tpl_1" }));
    expect(res.status).toBe(404);
  });
});
