/**
 * 069 — Lo que falta, con su enlace.
 *
 * Quien configura un agente por la API (Claude con el MCP, un script) no ve
 * la pantalla: si solo le decimos «falta la llave de la IA», inventa de dónde
 * sacarla. Por eso cada pendiente lleva la URL exacta donde se resuelve: la
 * del proveedor y la pantalla de ESTA instancia, absolutas.
 */
import { GUIA_DEL_PAR } from "@/server/onboarding/guide";
import type { ReadinessStep } from "@/server/onboarding/status";
import { origenInstancia } from "@/server/oauth/puerta";

export type Enlace = { titulo: string; url: string };

export const OPENROUTER = {
  cuenta: "https://openrouter.ai",
  llaves: "https://openrouter.ai/settings/keys",
  saldo: "https://openrouter.ai/settings/credits",
} as const;

/** El origen público de la instancia (`APP_BASE_URL`), no el Host de la petición. */
export function origenPublico(): string {
  return origenInstancia();
}

/** Dónde se crea la llave de OpenRouter, dónde se carga saldo y dónde se pega en el CRM. */
export function enlacesOpenRouter(origen: string): Enlace[] {
  return [
    { titulo: "Crear la llave en OpenRouter (Keys → Create key)", url: OPENROUTER.llaves },
    { titulo: "Cargar saldo en OpenRouter (el consumo se cobra ahí, aparte de Vocero)", url: OPENROUTER.saldo },
    { titulo: "Pegar la llave en el CRM: Ajustes → IA (o con save_ai_key)", url: `${origen}/settings/ai` },
  ];
}

/** Qué ruta de la API v1 resuelve cada paso, para que un agente no tenga que mandar a la pantalla. */
const RUTA_API: Record<string, string> = {
  ai: "PUT /api/v1/ai",
  profile: "PUT /api/v1/agent/profile",
  calendar: "PUT /api/v1/calendar/settings",
};

const PANTALLA: Record<string, string> = {
  "/agent": "Agente",
  "/settings/whatsapp": "Ajustes → WhatsApp",
  "/settings/ai": "Ajustes → IA",
  "/settings/calendar": "Ajustes → Agenda",
};

export type Pendiente = {
  key: string;
  label: string;
  status: ReadinessStep["status"];
  explicacion: string;
  /** Lo que está mal, cuando no es solo que falte (llave rechazada, token vencido). */
  problema: string | null;
  enlaces: Enlace[];
  api: string | null;
};

function enlacesDe(s: ReadinessStep, origen: string): Enlace[] {
  if (s.key === "ai") return enlacesOpenRouter(origen);
  // El agente (cerebro) se conecta en el despliegue, no en una pantalla: la
  // receta del par dice cómo (BRAIN_DISPATCH_URL + BOT_API_KEY).
  if (s.key === "brain") return [{ titulo: "Cómo conectar tu agente (Nea u otro)", url: GUIA_DEL_PAR }];
  if (!s.href) return [];
  return [{ titulo: `Abrir en el CRM: ${PANTALLA[s.href] ?? s.label}`, url: `${origen}${s.href}` }];
}

/** Los pasos que aún no están listos, cada uno con su explicación y sus enlaces. */
export function pendientesConEnlaces(steps: readonly ReadinessStep[], origen: string): Pendiente[] {
  return steps
    .filter((s) => s.status !== "ready" && s.status !== "not_applicable")
    .map((s) => ({
      key: s.key,
      label: s.label,
      status: s.status,
      explicacion: s.nextAction,
      problema: s.problem,
      enlaces: enlacesDe(s, origen),
      api: RUTA_API[s.key] ?? null,
    }));
}
