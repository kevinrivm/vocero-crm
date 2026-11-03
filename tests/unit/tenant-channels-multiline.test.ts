import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPublish = vi.fn();
const mockDespachar = vi.fn();
const mockDespachoActivoOrg = vi.fn().mockResolvedValue(true);

vi.mock("@/server/events/bus", () => ({
  publish: mockPublish,
}));

vi.mock("@/server/dispatch/encolar", () => ({
  despacharAlCerebro: mockDespachar,
}));

vi.mock("@/server/brains/config", () => ({
  despachoActivoOrg: mockDespachoActivoOrg,
  despachoActivo: () => true,
}));

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: mockSelect.mockReturnValue({
      from: mockFrom.mockReturnValue({
        where: mockWhere.mockReturnValue({
          limit: mockLimit,
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: "msg_123",
              createdAt: new Date(),
              type: "text",
              direction: "in",
              status: "delivered",
              aiGenerated: false,
            },
          ]),
        }),
        returning: vi.fn().mockResolvedValue([{ id: "conv_123", contactId: "ct_123" }]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
  }),
  schema: {
    tenantChannels: {
      id: "id",
      organizationId: "organization_id",
      providerId: "provider_id",
      enableAi: "enable_ai",
    },
    contact: { id: "id", organizationId: "organization_id", waIdentity: "wa_identity" },
    conversation: {
      id: "id",
      organizationId: "organization_id",
      contactId: "contact_id",
      isTest: "is_test",
    },
    message: { id: "id" },
    lead: { id: "id" },
  },
}));

vi.mock("@/server/inbox/identity", () => ({
  findContactByIdentity: vi.fn().mockResolvedValue({ id: "ct_123", channel: "whatsapp" }),
  getOrCreateContactByIdentity: vi.fn().mockResolvedValue({
    contact: { id: "ct_123", channel: "whatsapp" },
  }),
}));

vi.mock("@/server/inbox/quotes", () => ({
  resolverCita: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/server/inbox/lead-activity", () => ({
  onLeadActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/server/attribution/referral", () => ({
  anuncioDeWhatsapp: vi.fn().mockReturnValue(null),
}));

describe("Cortafuegos de IA por Línea Multicanal (tenant_channels)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDespachoActivoOrg.mockResolvedValue(true);
  });

  it("si enableAi es false, guarda el mensaje, emite SSE pero NO despacha al cerebro", async () => {
    mockLimit.mockImplementation(() =>
      Promise.resolve([
        {
          id: "conv_123",
          contactId: "ct_123",
          enableAi: false,
        },
      ])
    );

    const { ingestInboundMessage } = await import("@/server/inbox/ingest");

    await ingestInboundMessage({
      organizationId: "org_tenant_1",
      identity: {
        identity: "5215512345678",
        channel: "whatsapp",
        phone: "5215512345678",
        waUserId: null,
        profileName: "Cliente Prueba",
      },
      waMessageId: "wamid_cortafuegos_1",
      type: "text",
      text: "Hola quiero información",
      timestamp: "1700000000",
      providerId: "phone_num_soporte",
      enableAi: false,
    });

    // Debe emitir el mensaje al Bus SSE para que aparezca en la bandeja
    expect(mockPublish).toHaveBeenCalledWith(
      "org_tenant_1",
      expect.objectContaining({ type: "message.new" })
    );

    // Cortafuegos: NO debe haber despachado al cerebro (Nea/n8n)
    expect(mockDespachar).not.toHaveBeenCalled();
  });

  it("si enableAi es true, guarda el mensaje, emite SSE y SÍ despacha al cerebro", async () => {
    mockLimit.mockImplementation(() =>
      Promise.resolve([
        {
          id: "conv_123",
          contactId: "ct_123",
          enableAi: true,
        },
      ])
    );

    const { ingestInboundMessage } = await import("@/server/inbox/ingest");

    await ingestInboundMessage({
      organizationId: "org_tenant_1",
      identity: {
        identity: "5215512345678",
        channel: "whatsapp",
        phone: "5215512345678",
        waUserId: null,
        profileName: "Cliente Prueba",
      },
      waMessageId: "wamid_cortafuegos_2",
      type: "text",
      text: "Hola quiero comprar",
      timestamp: "1700000000",
      providerId: "phone_num_ventas",
      enableAi: true,
    });

    // Debe emitir el mensaje al Bus SSE
    expect(mockPublish).toHaveBeenCalledWith(
      "org_tenant_1",
      expect.objectContaining({ type: "message.new" })
    );

    // Debe despachar al cerebro para atención inteligente
    expect(mockDespachar).toHaveBeenCalled();
  });
});
