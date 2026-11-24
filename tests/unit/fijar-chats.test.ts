import { beforeEach, describe, expect, it, vi } from "vitest";
import { fijadosPrimero, LIMITE_FIJADOS, MENSAJE_LIMITE_FIJADOS } from "@/lib/fijados";

/**
 * 070 — Fijar chats: el orden (FC-3, FC-4), las rutas (FC-2, FC-7) y que la
 * lista de la API v1 no lleve los fijados (FC-9). El límite con candado y la
 * cascada se prueban contra la base real en `scripts/e2e-fijar-chats.mjs`.
 */

const c = (id: string, pinnedAt: string | null = null) => ({ id, pinnedAt });

describe("fijadosPrimero", () => {
  it("sube los fijados, el más reciente primero, y deja el resto en su orden", () => {
    const lista = [c("a"), c("b", "2026-11-23T10:00:00Z"), c("c"), c("d", "2026-11-23T11:00:00Z"), c("e")];
    expect(fijadosPrimero(lista).map((x) => x.id)).toEqual(["d", "b", "a", "c", "e"]);
  });

  it("sin fijados, la lista queda igual", () => {
    expect(fijadosPrimero([c("z"), c("y"), c("x")]).map((x) => x.id)).toEqual(["z", "y", "x"]);
  });

  it("no muta la entrada y trata pinnedAt ausente como no fijado", () => {
    const lista = [{ id: "a" }, { id: "b", pinnedAt: "2026-11-23T10:00:00Z" }];
    const copia = JSON.stringify(lista);
    expect(fijadosPrimero(lista).map((x) => x.id)).toEqual(["b", "a"]);
    expect(JSON.stringify(lista)).toBe(copia);
  });

  it("el límite es 3, con su mensaje", () => {
    expect(LIMITE_FIJADOS).toBe(3);
    expect(MENSAJE_LIMITE_FIJADOS).toBe("Solo puedes fijar 3 chats. Desfija uno para fijar este.");
  });
});

const m = vi.hoisted(() => ({
  session: vi.fn(),
  pin: vi.fn(),
  unpin: vi.fn(),
  list: vi.fn(),
  withPins: vi.fn(),
}));

vi.mock("@/lib/auth/session", async (original) => ({
  ...(await original<typeof import("@/lib/auth/session")>()),
  requireSession: m.session,
}));
vi.mock("@/server/inbox/pins", async (original) => ({
  ...(await original<typeof import("@/server/inbox/pins")>()),
  pinConversation: m.pin,
  unpinConversation: m.unpin,
  withPins: m.withPins,
}));
vi.mock("@/server/inbox/queries", () => ({ listConversations: m.list }));

const ctx = { params: Promise.resolve({ id: "cv_1" }) };
const req = new Request("http://x/api", { method: "POST" });

beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset();
  m.session.mockResolvedValue({ organizationId: "org_a", userId: "usr_1", role: "member" });
});

describe("POST/DELETE /api/conversations/[id]/pin", () => {
  it("fija para el usuario de la sesión, en su organización", async () => {
    m.pin.mockResolvedValue({ pinnedAt: new Date("2026-11-23T12:00:00Z") });
    const { POST } = await import("@/app/api/conversations/[id]/pin/route");
    const res = await POST(req, ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pinned: true, pinnedAt: "2026-11-23T12:00:00.000Z" });
    expect(m.pin).toHaveBeenCalledWith("org_a", "usr_1", "cv_1");
  });

  it("el cuarto → 409 pin_limit con el mensaje", async () => {
    const { PinError } = await import("@/server/inbox/pins");
    m.pin.mockRejectedValue(new PinError(409, "pin_limit", MENSAJE_LIMITE_FIJADOS));
    const { POST } = await import("@/app/api/conversations/[id]/pin/route");
    const res = await POST(req, ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("pin_limit");
  });

  it("ajena o del Laboratorio → 404", async () => {
    const { PinError } = await import("@/server/inbox/pins");
    m.unpin.mockRejectedValue(new PinError(404, "not_found", "Conversación no encontrada"));
    const { DELETE } = await import("@/app/api/conversations/[id]/pin/route");
    expect((await DELETE(req, ctx)).status).toBe(404);
  });

  it("sin sesión → 401", async () => {
    const { UnauthorizedError } = await import("@/lib/auth/session");
    m.session.mockRejectedValue(new UnauthorizedError());
    const { POST } = await import("@/app/api/conversations/[id]/pin/route");
    expect((await POST(req, ctx)).status).toBe(401);
    expect(m.pin).not.toHaveBeenCalled();
  });
});

describe("la lista de conversaciones", () => {
  const lista = [{ id: "cv_1" }, { id: "cv_2" }];

  it("con sesión de la UI trae pinnedAt del usuario", async () => {
    m.list.mockResolvedValue(lista);
    m.withPins.mockResolvedValue([{ id: "cv_1", pinnedAt: "2026-11-23T12:00:00.000Z" }, { id: "cv_2", pinnedAt: null }]);
    const { GET } = await import("@/server/http/conversations");
    const res = await GET({ organizationId: "org_a", userId: "usr_1", role: "member" } as never, new Request("http://x/api"));
    expect(m.withPins).toHaveBeenCalledWith(lista, "org_a", "usr_1");
    expect((await res.json()).conversations[0].pinnedAt).toBe("2026-11-23T12:00:00.000Z");
  });

  it("con la API v1 (sesión con capabilities) no los trae", async () => {
    m.list.mockResolvedValue(lista);
    const { GET } = await import("@/server/http/conversations");
    const res = await GET(
      { organizationId: "org_a", userId: "usr_1", role: "member", capabilities: ["read"] } as never,
      new Request("http://x/api")
    );
    expect(m.withPins).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({ conversations: lista });
  });
});
