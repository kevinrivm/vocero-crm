import { beforeEach, describe, expect, it, vi } from "vitest";

/** 062 · AC5 — La apariencia del negocio solo la cambia quien configura. */
const mocks = vi.hoisted(() => ({ session: vi.fn(), guardar: vi.fn(), leer: vi.fn() }));

vi.mock("@/lib/auth/session", async (original) => ({
  ...(await original<typeof import("@/lib/auth/session")>()),
  requireSession: mocks.session,
}));
vi.mock("@/server/apariencia", () => ({
  aparienciaDelNegocio: mocks.leer,
  guardarAparienciaDelNegocio: mocks.guardar,
}));

import { GET, PUT } from "@/app/api/settings/appearance/route";

const valida = { tema: "papel", letra: "inter", tamano: "grande", densidad: "compacta" };
const pedir = (body: unknown) =>
  PUT(
    new Request("http://localhost/api/settings/appearance", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ organizationId: "org_a", role: "owner" });
  mocks.leer.mockResolvedValue(null);
});

describe("062 — PUT /api/settings/appearance", () => {
  it("el dueño la guarda en su organización", async () => {
    const res = await pedir(valida);
    expect(res.status).toBe(200);
    expect(mocks.guardar).toHaveBeenCalledWith("org_a", valida);
  });

  it("un miembro del equipo recibe 403 y no se guarda nada", async () => {
    mocks.session.mockResolvedValue({ organizationId: "org_a", role: "member" });
    expect((await pedir(valida)).status).toBe(403);
    expect(mocks.guardar).not.toHaveBeenCalled();
  });

  it("un tema que no existe o un tamaño inventado es 422", async () => {
    expect((await pedir({ ...valida, tema: "hackeado" })).status).toBe(422);
    expect((await pedir({ ...valida, tamano: "gigante" })).status).toBe(422);
    expect(mocks.guardar).not.toHaveBeenCalled();
  });

  it("un tema propio ilegible es 422 con el motivo", async () => {
    const res = await pedir({ ...valida, tema: "propio", propio: { fondo: "#ffffff", texto: "#eeeeee", marco: "#dddddd" } });
    expect(res.status).toBe(422);
    expect((await res.json()).error.message).toMatch(/no se lee/);
  });

  it("GET devuelve la del negocio", async () => {
    mocks.leer.mockResolvedValue(valida);
    const res = await GET();
    expect(await res.json()).toEqual({ apariencia: valida });
    expect(mocks.leer).toHaveBeenCalledWith("org_a");
  });
});
