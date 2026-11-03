import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(),
  schema: {
    organization: {
      id: "id",
      name: "name",
      evoApiKey: "evoApiKey",
      evoUrl: "evoUrl",
      evoInstance: "evoInstance",
    },
  },
}));

vi.mock("@/server/inbox/ingest", () => ({
  ingestInboundMessage: vi.fn().mockResolvedValue(undefined),
}));

import { GET, POST } from "@/app/api/webhooks/evolution/[tenantId]/route";
import { getDb } from "@/lib/db";
import { ingestInboundMessage } from "@/server/inbox/ingest";
import { sendEvolutionText } from "@/server/evolution/client";

describe("Evolution API Webhook Adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET responde con estado OK e identificación del servicio", async () => {
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ tenantId: "org_123" }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe("ok");
    expect(data.service).toBe("evolution-webhook-adapter");
    expect(data.tenantId).toBe("org_123");
  });

  it("POST responde 404 si el tenant no existe en la base de datos", async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };
    (getDb as any).mockReturnValue(mockDb);

    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "messages.upsert" }),
    });

    const res = await POST(req, {
      params: Promise.resolve({ tenantId: "org_not_found" }),
    });
    expect(res.status).toBe(404);
  });

  it("POST ignora eventos que no sean messages.upsert sin arrojar error", async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { id: "org_123", name: "Empresa Demo", evoApiKey: "key_abc" },
            ]),
          }),
        }),
      }),
    };
    (getDb as any).mockReturnValue(mockDb);

    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "qrcode.updated" }),
    });

    const res = await POST(req, {
      params: Promise.resolve({ tenantId: "org_123" }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe("ignored");
    expect(ingestInboundMessage).not.toHaveBeenCalled();
  });

  it("POST procesa un evento messages.upsert y llama a ingestInboundMessage", async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { id: "org_123", name: "Empresa Demo", evoApiKey: "key_abc" },
            ]),
          }),
        }),
      }),
    };
    (getDb as any).mockReturnValue(mockDb);

    const payload = {
      event: "messages.upsert",
      instance: "demo-instance",
      data: {
        key: {
          remoteJid: "573001234567@s.whatsapp.net",
          fromMe: false,
          id: "3EB0ABC999",
        },
        pushName: "Carlos Gómez",
        message: {
          conversation: "Hola, me interesa más información",
        },
        messageTimestamp: 1714500000,
      },
    };

    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const res = await POST(req, {
      params: Promise.resolve({ tenantId: "org_123" }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.processed).toBe(1);

    expect(ingestInboundMessage).toHaveBeenCalledTimes(1);
    expect(ingestInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_123",
        identity: expect.objectContaining({
          identity: "573001234567",
          channel: "whatsapp",
          phone: "573001234567",
          profileName: "Carlos Gómez",
        }),
        waMessageId: "evo_3EB0ABC999",
        text: "Hola, me interesa más información",
      })
    );
  });

  it("POST omite mensajes salientes (fromMe: true)", async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { id: "org_123", name: "Empresa Demo", evoApiKey: "key_abc" },
            ]),
          }),
        }),
      }),
    };
    (getDb as any).mockReturnValue(mockDb);

    const payload = {
      event: "MESSAGES_UPSERT",
      data: {
        key: {
          remoteJid: "573001234567@s.whatsapp.net",
          fromMe: true,
          id: "3EB0OUTBOUND",
        },
        message: { conversation: "Mensaje que envié yo" },
      },
    };

    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const res = await POST(req, {
      params: Promise.resolve({ tenantId: "org_123" }),
    });
    const data = await res.json();

    expect(data.processed).toBe(0);
    expect(ingestInboundMessage).not.toHaveBeenCalled();
  });

  it("sendEvolutionText realiza la llamada POST con los encabezados y payload correspondientes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        key: { id: "EVO_RESP_123" },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendEvolutionText({
      evoUrl: "https://evo.example.com/",
      evoInstance: "instancia-test",
      evoApiKey: "secret_evo_key",
      to: "+57 (300) 123-4567",
      text: "Mensaje de prueba",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://evo.example.com/message/sendText/instancia-test",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          apikey: "secret_evo_key",
        }),
        body: JSON.stringify({
          number: "573001234567",
          text: "Mensaje de prueba",
          options: {
            delay: 1000,
            presence: "composing",
          },
        }),
      })
    );

    expect(result.id).toBe("EVO_RESP_123");
    expect(result.status).toBe("sent");

    vi.unstubAllGlobals();
  });
});

