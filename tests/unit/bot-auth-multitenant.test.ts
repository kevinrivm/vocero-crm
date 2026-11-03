import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authenticateBot } from "@/lib/auth/bot";

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
        limit: mockLimit,
      }),
    }),
  }),
  schema: {
    organization: {
      id: "organization_id",
      botApiKey: "bot_api_key",
    },
  },
}));

describe("authenticateBot - Autenticación Multi-Tenant del Bot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.BOT_API_KEY;
  });

  afterEach(() => {
    delete process.env.BOT_API_KEY;
  });

  it("rechaza con 401 si no hay encabezado Authorization ni X-API-Key", async () => {
    const req = new Request("http://localhost/api/bot/context");
    const result = await authenticateBot(req);
    expect(result.ok).toBe(false);
    expect(result.response?.status).toBe(401);
  });

  it("acepta X-API-Key válida y devuelve el organizationId del tenant", async () => {
    mockLimit.mockResolvedValueOnce([{ id: "org_tenant_123" }]);

    const req = new Request("http://localhost/api/bot/context", {
      headers: { "x-api-key": "nexia_key_valid_12345" },
    });

    const result = await authenticateBot(req);
    expect(result.ok).toBe(true);
    expect(result.organizationId).toBe("org_tenant_123");
  });

  it("acepta Authorization: Bearer <token> y devuelve el organizationId del tenant", async () => {
    mockLimit.mockResolvedValueOnce([{ id: "org_tenant_456" }]);

    const req = new Request("http://localhost/api/bot/context", {
      headers: { authorization: "Bearer nexia_bearer_token_abc" },
    });

    const result = await authenticateBot(req);
    expect(result.ok).toBe(true);
    expect(result.organizationId).toBe("org_tenant_456");
  });

  it("rechaza con 401 si la API Key no coincide con ninguna organización", async () => {
    mockLimit.mockResolvedValueOnce([]); // no org found

    const req = new Request("http://localhost/api/bot/context", {
      headers: { "x-api-key": "clave_inexistente" },
    });

    const result = await authenticateBot(req);
    expect(result.ok).toBe(false);
    expect(result.response?.status).toBe(401);
  });

  it("usa el fallback de entorno si coincide con BOT_API_KEY global", async () => {
    process.env.BOT_API_KEY = "global_bot_key_secret_123";
    mockLimit
      .mockResolvedValueOnce([]) // no tenant específico
      .mockResolvedValueOnce([{ id: "org_fallback_default" }]); // primer org

    const req = new Request("http://localhost/api/bot/context", {
      headers: { "x-api-key": "global_bot_key_secret_123" },
    });

    const result = await authenticateBot(req);
    expect(result.ok).toBe(true);
    expect(result.organizationId).toBe("org_fallback_default");
  });
});
