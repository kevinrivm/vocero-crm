import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serializeBotProfile } from "@/server/bot/profile";
import type { schema } from "@/lib/db";
import { resetRateLimit } from "@/lib/rate-limit";
// Estático a propósito: `vi.mock` se hoistea por encima de los imports, así que
// la ruta ya nace con la BD falsa. Importarla DENTRO de cada test cargaba la
// cadena de módulos con el reloj corriendo y, con la suite completa en
// paralelo, el primero se pasaba de los 5 s de timeout.
import { GET } from "@/app/api/bot/profile/route";

const dbState = vi.hoisted(() => ({ queue: [] as unknown[][] }));

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "from", "where", "limit", "orderBy"]) {
    builder[m] = () => builder;
  }
  (builder as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    resolve(dbState.queue.shift() ?? []);
  return { ...actual, getDb: () => builder };
});

vi.mock("@/server/bot/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/bot/auth")>();
  return { ...actual, resolveInstanceOrg: async () => "org_1" };
});

/** Perfil del agente + knowledge base vía la API de servicio `/api/bot/*`. */

type AgentProfile = typeof schema.agentProfile.$inferSelect;
type KbEntry = typeof schema.kbEntry.$inferSelect;

function profileRow(overrides: Partial<AgentProfile> = {}): AgentProfile {
  return {
    id: "ap_1",
    organizationId: "org_1",
    reactivateAfterHours: null,
    enabled: false,
    name: "Sofi",
    tone: "cálido y directo",
    instructions: "Vendemos limpiezas dentales.",
    escalationRules: "Urgencias de dolor → humano.",
    greeting: "¡Hola! Soy Sofi 🦷",
    role: "calificador",
    tools: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function qa(question: string, answer: string): KbEntry {
  return {
    id: `kb_${question}`,
    organizationId: "org_1",
    kind: "qa",
    question,
    answer,
    content: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("034 — role y tools en el perfil", () => {
  it("con herramientas apagadas viajan solo las encendidas, y escalar siempre", () => {
    const out = serializeBotProfile(profileRow({ tools: ["ficha"] }), []);
    expect(out.profile.tools).toEqual(["ficha", "escalar"]);
    expect(out.profile.role).toBe("calificador");
  });

  it("un rol que ya no existe cae al Calificador; claves desconocidas se ignoran", () => {
    const out = serializeBotProfile(profileRow({ role: "vendedor", tools: ["agendar", "volar"] }), []);
    expect(out.profile.role).toBe("calificador");
    expect(out.profile.tools).toEqual(["agendar", "escalar"]);
  });
});

describe("serializeBotProfile", () => {
  it("perfil completo → shape exacto del contrato", () => {
    const out = serializeBotProfile(profileRow(), [
      qa("¿Cuánto cuesta?", "$800."),
    ]);
    expect(out).toEqual({
      profile: {
        name: "Sofi",
        tone: "cálido y directo",
        instructions: "Vendemos limpiezas dentales.",
        escalationRules: "Urgencias de dolor → humano.",
        greeting: "¡Hola! Soy Sofi 🦷",
        role: "calificador",
        tools: ["ficha", "etapa", "agendar", "reprogramar", "salida", "escalar"],
      },
      kb: "P: ¿Cuánto cuesta?\nR: $800.",
      resources: [],
      llm: null,
    });
  });

  it("036 — llm: el proxy y el modelo del negocio cuando hay con qué pensar", () => {
    const llm = { path: "/api/bot/llm", model: "openai/gpt-4o-mini" };
    expect(serializeBotProfile(profileRow(), [], llm).llm).toEqual(llm);
  });

  it("opcionales vacíos viajan como null, no como cadenas", () => {
    const out = serializeBotProfile(
      profileRow({ tone: null, instructions: null, escalationRules: null, greeting: null }),
      []
    );
    expect(out.profile.tone).toBeNull();
    expect(out.profile.instructions).toBeNull();
    expect(out.profile.escalationRules).toBeNull();
    expect(out.profile.greeting).toBeNull();
  });

  it("KB vacío → render canónico '(knowledge base vacío)'", () => {
    expect(serializeBotProfile(profileRow(), []).kb).toBe("(knowledge base vacío)");
  });

  it("enabled NO viaja: gobierna solo la IA in-process", () => {
    const out = serializeBotProfile(profileRow({ enabled: false }), []);
    expect("enabled" in out.profile).toBe(false);
    // Y enabled=true produce exactamente lo mismo:
    expect(serializeBotProfile(profileRow({ enabled: true }), [])).toEqual(out);
  });

  it("resources siempre presente y vacío mientras no haya recursos reales", () => {
    expect(serializeBotProfile(profileRow(), []).resources).toEqual([]);
  });

  it("bloques del KB van tal cual, mezclados con P/R en orden", () => {
    const block: KbEntry = { ...qa("x", "y"), kind: "block", question: null, answer: null, content: "Horario: L-V 9-18." };
    const out = serializeBotProfile(profileRow(), [qa("¿Dónde están?", "En Querétaro."), block]);
    expect(out.kb).toBe("P: ¿Dónde están?\nR: En Querétaro.\n\nHorario: L-V 9-18.");
  });
});

describe("GET /api/bot/profile (ruta, DB fake)", () => {
  const KEY = "clave-de-servicio-larga-0123456789abcdef";

  beforeEach(() => {
    vi.stubEnv("BOT_API_KEY", KEY);
    resetRateLimit();
    dbState.queue = [];
  });
  afterEach(() => vi.unstubAllEnvs());

  function req(key?: string): Request {
    return new Request("http://localhost/api/bot/profile", {
      headers: key ? { "x-api-key": key } : {},
    });
  }

  it("sin API key → 401 (no filtra existencia del perfil)", async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("instancia sin perfil (legada) → 404 no_profile", async () => {
    dbState.queue = [[]];
    const res = await GET(req(KEY));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("no_profile");
  });

  it("perfil + KB → 200 con el payload del serializador", async () => {
    dbState.queue = [[profileRow()], [qa("¿Cuánto?", "$800.")]];
    const res = await GET(req(KEY));
    expect(res.status).toBe(200);
    const body = (await res.json()) as ReturnType<typeof serializeBotProfile>;
    expect(body.profile.name).toBe("Sofi");
    expect(body.kb).toBe("P: ¿Cuánto?\nR: $800.");
    expect(body.resources).toEqual([]);
  });
});
