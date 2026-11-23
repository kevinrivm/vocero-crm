import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 068 — Contestar desde la Bandeja pausa la IA igual que contestar desde el
 * teléfono, y solo tras un envío que salió. Se comprueba en las cinco rutas
 * por las que una persona le escribe al cliente.
 */

const m = vi.hoisted(() => ({
  session: vi.fn(),
  pausar: vi.fn(),
  conversation: vi.fn(),
  sendText: vi.fn(),
  sendStructured: vi.fn(),
  sendMedia: vi.fn(),
  forwardMessage: vi.fn(),
  forwardImage: vi.fn(),
  sendTemplate: vi.fn(),
  update: vi.fn(),
  publish: vi.fn(),
}));

vi.mock("@/lib/auth/session", async (original) => ({
  ...(await original<typeof import("@/lib/auth/session")>()),
  requireSession: m.session,
}));
vi.mock("@/server/inbox/queries", () => ({ getConversation: m.conversation }));
vi.mock("@/server/inbox/send", async (original) => ({
  ...(await original<typeof import("@/server/inbox/send")>()),
  sendText: m.sendText,
  sendStructured: m.sendStructured,
  sendMediaMessage: m.sendMedia,
}));
vi.mock("@/server/inbox/forward-message", () => ({ forwardMessage: m.forwardMessage }));
vi.mock("@/server/inbox/forward-image", async (original) => ({
  ...(await original<typeof import("@/server/inbox/forward-image")>()),
  forwardImage: m.forwardImage,
}));
vi.mock("@/server/whatsapp/templates", async (original) => ({
  ...(await original<typeof import("@/server/whatsapp/templates")>()),
  sendTemplate: m.sendTemplate,
}));

import { SendError } from "@/server/inbox/send";

const ctx = { params: Promise.resolve({ id: "cv_1" }) };
const json = (body: unknown) =>
  new Request("http://x/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.resetModules();
  for (const f of Object.values(m)) f.mockReset();
  m.session.mockResolvedValue({ organizationId: "org_a" });
  m.conversation.mockResolvedValue({
    conversation: { id: "cv_1", isTest: false, channel: "whatsapp" },
    contact: { id: "ct_1" },
  });
  vi.doMock("@/server/inbox/pausa-manual", () => ({
    pausarIaTrasEnvioDeLaBandeja: m.pausar,
  }));
});

describe("068 · las rutas de la Bandeja pausan la IA tras enviar", () => {
  it("texto", async () => {
    m.sendText.mockResolvedValue({ messageId: "msg_1" });
    const { POST } = await import("@/app/api/conversations/[id]/messages/route");
    const res = await POST(json({ text: "hola" }), ctx);
    expect(res.status).toBe(200);
    expect(m.pausar).toHaveBeenCalledWith("org_a", "cv_1");
  });

  it("texto que Meta rechaza → no pausa", async () => {
    m.sendText.mockRejectedValue(new SendError("window_closed", "cerrada"));
    const { POST } = await import("@/app/api/conversations/[id]/messages/route");
    const res = await POST(json({ text: "hola" }), ctx);
    expect(res.status).toBe(409);
    expect(m.pausar).not.toHaveBeenCalled();
  });

  it("ubicación", async () => {
    m.sendStructured.mockResolvedValue({ messageId: "msg_1" });
    const { POST } = await import("@/app/api/conversations/[id]/messages/route");
    await POST(json({ type: "location", location: { latitude: 19.4, longitude: -99.1 } }), ctx);
    expect(m.pausar).toHaveBeenCalledWith("org_a", "cv_1");
  });

  it("adjunto", async () => {
    m.sendMedia.mockResolvedValue({ messageId: "msg_1" });
    const { POST } = await import("@/app/api/conversations/[id]/messages/media/route");
    const form = new FormData();
    form.set("file", new File([Buffer.from("x")], "a.jpg", { type: "image/jpeg" }));
    const res = await POST(new Request("http://x/api", { method: "POST", body: form }), ctx);
    expect(res.status).toBe(201);
    expect(m.pausar).toHaveBeenCalledWith("org_a", "cv_1");
  });

  it("reenvío", async () => {
    m.forwardMessage.mockResolvedValue({ messageId: "msg_1" });
    const { POST } = await import("@/app/api/conversations/[id]/messages/forward/route");
    const res = await POST(json({ sourceMessageId: "msg_src" }), ctx);
    expect(res.status).toBe(201);
    expect(m.pausar).toHaveBeenCalledWith("org_a", "cv_1");
  });

  it("reenvío de imagen", async () => {
    m.forwardImage.mockResolvedValue({ messageId: "msg_1" });
    const { POST } = await import(
      "@/app/api/conversations/[id]/messages/forward-image/route"
    );
    const res = await POST(json({ sourceMessageId: "msg_src" }), ctx);
    expect(res.status).toBe(201);
    expect(m.pausar).toHaveBeenCalledWith("org_a", "cv_1");
  });

  it("plantilla", async () => {
    m.sendTemplate.mockResolvedValue({ messageId: "msg_1" });
    const { POST } = await import("@/app/api/conversations/[id]/messages/template/route");
    const res = await POST(json({ templateId: "tpl_1" }), ctx);
    expect(res.status).toBe(200);
    expect(m.pausar).toHaveBeenCalledWith("org_a", "cv_1");
  });

  it("plantilla rechazada → no pausa", async () => {
    m.sendTemplate.mockRejectedValue(new SendError("not_connected", "sin número"));
    const { POST } = await import("@/app/api/conversations/[id]/messages/template/route");
    await POST(json({ templateId: "tpl_1" }), ctx);
    expect(m.pausar).not.toHaveBeenCalled();
  });
});

describe("068 · pausarIaTrasEnvioDeLaBandeja", () => {
  function mockDb(filas: unknown[] | Error) {
    vi.doUnmock("@/server/inbox/pausa-manual");
    vi.doMock("@/server/events/bus", () => ({ publish: m.publish }));
    vi.doMock("@/lib/db", async (original) => ({
      ...(await original<typeof import("@/lib/db")>()),
      getDb: () => ({
        update: () => {
          const c = {
            set: (v: unknown) => {
              m.update(v);
              return c;
            },
            where: () => c,
            returning: () =>
              filas instanceof Error ? Promise.reject(filas) : Promise.resolve(filas),
          };
          return c;
        },
      }),
    }));
  }

  it("pausa con manual_reply y avisa a las pantallas", async () => {
    mockDb([{ id: "cv_1" }]);
    const { pausarIaTrasEnvioDeLaBandeja } = await import("@/server/inbox/pausa-manual");
    await pausarIaTrasEnvioDeLaBandeja("org_a", "cv_1");
    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({ aiEnabled: false, handoffReason: "manual_reply" })
    );
    expect(m.publish).toHaveBeenCalledWith("org_a", {
      type: "conversation.updated",
      data: { conversation: { id: "cv_1" } },
    });
  });

  it("si ya estaba en pausa (otro motivo), no la toca ni avisa", async () => {
    mockDb([]);
    const { pausarIaTrasEnvioDeLaBandeja } = await import("@/server/inbox/pausa-manual");
    await pausarIaTrasEnvioDeLaBandeja("org_a", "cv_1");
    expect(m.publish).not.toHaveBeenCalled();
  });

  it("un fallo de la base no tumba el envío que ya salió", async () => {
    mockDb(new Error("conexión perdida"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { pausarIaTrasEnvioDeLaBandeja } = await import("@/server/inbox/pausa-manual");
    await expect(pausarIaTrasEnvioDeLaBandeja("org_a", "cv_1")).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
