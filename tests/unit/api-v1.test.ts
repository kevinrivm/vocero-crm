import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 069 — API pública v1: la puerta por llave.
 *
 * Lo que de verdad importa aquí es que la organización salga de la llave, que
 * con la bandera apagada no exista nada, y que el permiso nunca pase de lo que
 * tiene quien la creó. El camino completo contra la app viva lo ejerce
 * `scripts/e2e-api-mcp.mjs`.
 */

const st = vi.hoisted(() => ({
  llave: null as null | Record<string, unknown>,
  instancia: "org_a" as string | null,
  role: "owner" as string | null,
  limite: true,
  usos: 0,
}));

vi.mock("@/server/bot/auth", () => ({ resolveInstanceOrg: async () => st.instancia }));
vi.mock("@/server/api-v1/acceso", async (orig) => {
  const real = await orig<typeof import("@/server/api-v1/acceso")>();
  return { ...real, rolVigente: async () => st.role };
});
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: () => ({ allowed: st.limite, remaining: 0 }),
  clientIp: () => "1.2.3.4",
}));
vi.mock("@/server/oauth/servidor", () => ({ accesoPorValor: async () => null, registrarUsoGrant: async () => {} }));
vi.mock("@/lib/db", () => {
  const update = () => ({
    set: () => ({
      where: () => {
        st.usos++;
        return Promise.resolve();
      },
    }),
  });
  return { getDb: () => ({ update }), schema: { organization: {}, apiKey: {} } };
});
vi.mock("@/server/api-v1/llaves", async (orig) => {
  const real = await orig<typeof import("@/server/api-v1/llaves")>();
  return { ...real, llavePorValor: async () => st.llave };
});

import { generarLlave, hashLlave, normalizarScopes } from "@/server/api-v1/llaves";
import { withApiKey } from "@/server/api-v1/handler";
import { parseApiV1Flag } from "@/server/api-v1/flag";

const LLAVE = "vk_" + "a".repeat(40);
const pedir = (auth: string | null = `Bearer ${LLAVE}`) =>
  new Request("https://crm.negocio.test/api/v1/contacts", { headers: auth ? { authorization: auth } : {} });

function llave(scopes: string[], organizationId = "org_a") {
  return { id: "ak_1", organizationId, prefix: "vk_aaaaaaa", last4: "aaaa", name: "n8n", scopes, createdByUserId: "usr_1" };
}

const envAntes = { API_V1: process.env.API_V1, APP_BASE_URL: process.env.APP_BASE_URL };
afterAll(() => {
  process.env.API_V1 = envAntes.API_V1;
  process.env.APP_BASE_URL = envAntes.APP_BASE_URL;
});

describe("llaves", () => {
  it("genera vk_ + 40 caracteres y guarda solo el sha256", () => {
    const g = generarLlave();
    expect(g.valor).toMatch(/^vk_[A-Za-z0-9_-]{40}$/);
    expect(g.hash).toBe(hashLlave(g.valor));
    expect(g.hash).not.toContain(g.valor);
    expect(g.prefix).toBe(g.valor.slice(0, 10));
    expect(g.last4).toBe(g.valor.slice(-4));
    expect(generarLlave().valor).not.toBe(g.valor);
  });

  it("leer va siempre, y mandar arrastra operar", () => {
    expect(normalizarScopes([])).toEqual(["read"]);
    expect(normalizarScopes(["send"])).toEqual(["read", "operate", "send"]);
    expect(normalizarScopes(["operate"])).toEqual(["read", "operate"]);
    // Configurar no arrastra operar: una llave de Claude que configura no mueve leads.
    expect(normalizarScopes(["configure"])).toEqual(["read", "configure"]);
  });

  it("la bandera API_V1 se enciende solo con un valor explícito", () => {
    for (const v of ["on", "1", "true", "sí", " ON "]) expect(parseApiV1Flag(v)).toBe(true);
    for (const v of [undefined, "", "off", "0", "no", "api"]) expect(parseApiV1Flag(v)).toBe(false);
  });
});

describe("withApiKey", () => {
  const handler = vi.fn(async (session: { organizationId: string; role: string; capabilities?: string[] }, _req: Request) =>
    Response.json({ org: session.organizationId, role: session.role, caps: session.capabilities })
  );

  beforeEach(() => {
    process.env.API_V1 = "on";
    st.instancia = "org_a";
    st.role = "owner";
    st.llave = llave(["read"]);
    st.limite = true;
    st.usos = 0;
    handler.mockClear();
  });

  it("con la bandera apagada responde 404 sin mirar la llave (no delata la ruta)", async () => {
    process.env.API_V1 = "";
    expect((await withApiKey("read", handler)(pedir(null))).status).toBe(404);
    expect((await withApiKey("read", handler)(pedir())).status).toBe(404);
    expect(handler).not.toHaveBeenCalled();
  });

  it("sin llave: 401 missing_key, y no llama al handler", async () => {
    const res = await withApiKey("read", handler)(pedir(null));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("missing_key");
    expect(handler).not.toHaveBeenCalled();
  });

  it("una cookie no autentica: solo cuenta la cabecera Authorization", async () => {
    const req = new Request("https://crm.negocio.test/api/v1/contacts", { headers: { cookie: "better-auth.session_token=x" } });
    expect((await withApiKey("read", handler)(req)).status).toBe(401);
  });

  it("llave desconocida o revocada: 401 invalid_key", async () => {
    st.llave = null;
    const res = await withApiKey("read", handler)(pedir());
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("invalid_key");
  });

  it("muchos fallos desde la misma IP: 429", async () => {
    st.llave = null;
    st.limite = false;
    expect((await withApiKey("read", handler)(pedir())).status).toBe(429);
  });

  it("la organización sale de la llave y el permiso se recorta", async () => {
    const res = await withApiKey("read", handler)(pedir());
    expect(res.status).toBe(200);
    // Sin `configure`, el handler ve a un miembro aunque quien la creó sea dueño.
    expect(await res.json()).toEqual({ org: "org_a", role: "member", caps: ["read"] });
    expect(st.usos).toBe(1);
  });

  it("una llave de otra organización (una base copiada) no sirve aquí", async () => {
    st.llave = llave(["read"], "org_b");
    const res = await withApiKey("read", handler)(pedir());
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it("si quien la creó salió del equipo, la llave no sirve", async () => {
    st.role = null;
    const res = await withApiKey("read", handler)(pedir());
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("key_owner_without_access");
  });

  it("una llave de lectura no opera ni manda", async () => {
    expect((await withApiKey("operate", handler)(pedir())).status).toBe(403);
    expect((await withApiKey("send", handler)(pedir())).status).toBe(403);
  });

  it("operar no basta para mandar: send es un permiso aparte", async () => {
    st.llave = llave(["read", "operate"]);
    expect((await withApiKey("operate", handler)(pedir())).status).toBe(200);
    expect((await withApiKey("send", handler)(pedir())).status).toBe(403);
    st.llave = llave(["read", "operate", "send"]);
    expect((await withApiKey("send", handler)(pedir())).status).toBe(200);
  });

  it("configure es un permiso aparte: ni leer ni operar lo dan", async () => {
    st.llave = llave(["read", "operate", "send"]);
    const res = await withApiKey("configure", handler)(pedir());
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("insufficient_scope");
    expect(handler).not.toHaveBeenCalled();
  });

  it("una llave configure de un dueño o administrador configura, con su rol", async () => {
    st.llave = llave(["read", "configure"]);
    const res = await withApiKey("configure", handler)(pedir());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ role: "owner", caps: ["read", "configure"] });
    st.role = "admin";
    expect((await withApiKey("configure", handler)(pedir())).status).toBe(200);
    // …y no opera: configurar no arrastra operar.
    expect((await withApiKey("operate", handler)(pedir())).status).toBe(403);
  });

  it("si a quien la creó lo bajan a miembro, su llave deja de configurar", async () => {
    st.llave = llave(["read", "operate", "configure"]);
    st.role = "member";
    expect((await withApiKey("configure", handler)(pedir())).status).toBe(403);
    const res = await withApiKey("operate", handler)(pedir());
    expect(res.status).toBe(200);
    expect((await res.json()).role).toBe("member");
  });

  it("pasado el límite: 429 con Retry-After", async () => {
    st.limite = false;
    const res = await withApiKey("read", handler)(pedir());
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("OpenAPI de la v1", () => {
  const raiz = join(process.cwd(), "src/app/api/v1");
  const spec = JSON.parse(readFileSync(join(process.cwd(), "src/server/api-v1/openapi.json"), "utf8")) as {
    paths: Record<string, Record<string, unknown>>;
  };

  function rutas(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) return rutas(p);
      return n === "route.ts" ? [p] : [];
    });
  }

  it("cada ruta y cada verbo del código está documentado, y nada más", () => {
    const delCodigo = new Set<string>();
    for (const archivo of rutas(raiz)) {
      const path = "/" + relative(raiz, archivo).split(sep).slice(0, -1).join("/").replace(/\[(\w+)\]/g, "{$1}");
      for (const m of readFileSync(archivo, "utf8").matchAll(/export (?:const|(?:async )?function) (GET|POST|PATCH|PUT|DELETE)\b/g)) {
        delCodigo.add(`${m[1]!.toLowerCase()} ${path}`);
      }
    }
    const documentadas = new Set<string>();
    for (const [path, ops] of Object.entries(spec.paths)) {
      for (const verbo of Object.keys(ops)) if (verbo !== "parameters") documentadas.add(`${verbo} ${path}`);
    }
    expect([...documentadas].sort()).toEqual([...delCodigo].sort());
  });
});

describe("/api/v1/openapi.json", () => {
  it("con la API encendida: el contrato con la URL pública de la instancia", async () => {
    process.env.API_V1 = "on";
    process.env.APP_BASE_URL = "https://crm.negocio.test/";
    const { GET } = await import("@/app/api/v1/openapi.json/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.openapi).toBe("3.1.0");
    expect(body.servers[0].url).toBe("https://crm.negocio.test/api/v1");
  });

  it("con la API apagada: 404", async () => {
    process.env.API_V1 = "off";
    const { GET } = await import("@/app/api/v1/openapi.json/route");
    expect((await GET()).status).toBe(404);
  });
});
