import { z } from "zod";

/**
 * Validación central del entorno.
 *
 * Lazy + memoizada: se evalúa en el primer uso en runtime, nunca al importar.
 * Durante `next build` no hay secretos (la imagen se construye sin ellos), así
 * que en esa fase se aceptan placeholders — los valores reales llegan al boot.
 */

export const envSchema = z.object({
  APP_BASE_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(16),
  ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, {
      message:
        "ENCRYPTION_KEY debe ser 32 bytes en base64 (genera con: openssl rand -base64 32)",
    }),
  META_WEBHOOK_VERIFY_TOKEN: z.string().min(8),
  META_APP_SECRET: z.string().optional(),
  // 066: «Conectar con Meta» (Embedded Signup v4) en Ajustes → WhatsApp. Con
  // las dos y META_APP_SECRET (el de ESA app) aparece el botón; sin ellas,
  // solo el alta manual. Se leen en server/whatsapp/embedded.ts.
  META_APP_ID: z.string().optional(),
  META_EMBEDDED_CONFIG_ID: z.string().optional(),
  META_GRAPH_API_VERSION: z.string().default("v25.0"),
  META_GRAPH_BASE_URL: z.string().url().default("https://graph.facebook.com"),
  OPENROUTER_API_TOKEN: z.string().optional(),
  OPENROUTER_BASE_URL: z.string().url().default("https://openrouter.ai/api"),
  OPENROUTER_MODEL: z.string().optional(),
  OPENROUTER_JUDGE_MODEL: z.string().optional(),
  // 014/017: canales encendidos, separados por coma. WhatsApp siempre esta on.
  // Ej.: CHANNELS=whatsapp,instagram,messenger. Sin ella, la instancia es solo
  // WhatsApp y las superficies de los demas canales responden 404.
  CHANNELS: z.string().optional(),
  // 015: motor de agenda. Apagado por defecto — sin el, toda la superficie de
  // agenda responde 404 y la UI no la menciona. Ej.: AGENDA=on
  AGENDA: z.string().optional(),
  // 016: atribucion de anuncios y reporte a la Conversions API de Meta.
  // Apagada por defecto: sin ella no se captura de que anuncio vino una
  // conversacion, no se le reporta nada a Meta y la superficie da 404.
  // Ej.: ATRIBUCION=on
  ATRIBUCION: z.string().optional(),
  // 069: API publica v1 (/api/v1/*), su MCP y el OAuth para conectarlo desde
  // claude.ai o ChatGPT. Apagada por defecto: sin ella toda esa superficie y
  // Ajustes -> API responden 404. Ej.: API_V1=on
  API_V1: z.string().optional(),
  // 015: bases de los conectores. Solo se sobreescriben para apuntar a los
  // mocks en el self-test; en producción se usan las reales.
  ZOOM_BASE_URL: z.string().url().default("https://api.zoom.us/v2"),
  ZOOM_OAUTH_BASE_URL: z.string().url().default("https://zoom.us"),
  GOOGLE_CAL_BASE_URL: z
    .string()
    .url()
    .default("https://www.googleapis.com/calendar/v3"),
  GOOGLE_OAUTH_BASE_URL: z.string().url().default("https://oauth2.googleapis.com"),
  ALLOW_SIGNUP: z.string().optional(),
  AGENT_COALESCE_MS: z.coerce.number().int().min(0).default(6000),
  // 075: cada cuánto la red de seguridad busca turnos entregados al cerebro
  // que nadie contestó. Intervalo interno, no ajuste del negocio; 0 la apaga
  // (los guiones locales la conducen a mano por /api/dev/red-de-seguridad).
  RED_DE_SEGURIDAD_MS: z.coerce.number().int().min(0).default(60_000),
  WA_MOCK_ENABLED: z.string().optional(),
  // API key de un cerebro externo que conduzca la conversación por /api/bot/*.
  // Sin ella, toda esa superficie responde 401.
  BOT_API_KEY: z.string().optional(),
  // «Quién responde a tus clientes»: el /health del cerebro externo (Nea),
  // consultado desde el servidor. Ej.: http://nea:8000/health (alias de la
  // red de Coolify). Sin ella, la tarjeta del Agente no pregunta a nadie.
  // No se valida aquí a propósito: es opcional y solo de diagnóstico, y con
  // `.url()` un valor mal escrito tumbaba el CRM entero (el entorno no
  // validaba y todo respondía 503). La tarjeta la marca como problema de
  // configuración y lo demás sigue funcionando (server/bot/status.ts).
  BRAIN_HEALTH_URL: z.string().optional(),
  // 021: a dónde le despacha el CRM cada turno al cerebro externo. Ej.:
  // http://nea:8000/vocero/dispatch. Con ella, `BOT_API_KEY` y el interruptor
  // del Agente encendido, contesta el cerebro (036). Tampoco se valida aquí,
  // por lo mismo que la de arriba: mal escrita, el despacho queda inactivo y
  // la tarjeta lo dice (server/brains/config.ts).
  BRAIN_DISPATCH_URL: z.string().optional(),
  // 008: volumen local de adjuntos. Es el camino por defecto y el de respaldo
  // del bucket (037).
  MEDIA_DIR: z.string().default("./.dev-media"),
  // 037: conector opcional (constitución II.3). `bucket` escribe los adjuntos,
  // el logo y el icono en un S3-compatible propio; se leen siempre de los dos
  // sitios (src/lib/storage/medios.ts). Las MEDIA_BUCKET_* no se validan aquí,
  // por lo mismo que BRAIN_HEALTH_URL: mal escritas, se escribe en disco y
  // `pnpm doctor` y /api/health lo dicen, en vez de tumbar el CRM entero.
  MEDIA_STORE: z.string().default("disco"),
  MEDIA_BUCKET_ENDPOINT: z.string().optional(),
  MEDIA_BUCKET_NAME: z.string().optional(),
  MEDIA_BUCKET_REGION: z.string().default("auto"),
  MEDIA_BUCKET_KEY_ID: z.string().optional(),
  MEDIA_BUCKET_SECRET: z.string().optional(),
  NODE_ENV: z.string().default("development"),
});

export type Env = z.infer<typeof envSchema>;

const BUILD_PLACEHOLDERS: Record<string, string> = {
  APP_BASE_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://build:build@localhost:5432/build",
  BETTER_AUTH_SECRET: "placeholder-build-secret",
  ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
  META_WEBHOOK_VERIFY_TOKEN: "placeholder-verify-token",
};

let cached: Env | null = null;

/**
 * Valida un entorno contra el esquema SIN lanzar ni cachear. Es lo que usa
 * `getEnv()` y también `pnpm doctor` (scripts/doctor.ts): un solo esquema y
 * una sola regla para los strings vacíos, que cuentan como ausentes porque
 * los compose/paneles suelen inyectar VAR="" para opcionales y eso debe
 * activar los defaults.
 */
export function safeParseEnv(source: Record<string, string | undefined>) {
  return envSchema.safeParse(stripEmpty(source));
}

export function getEnv(): Env {
  if (cached) return cached;
  const isBuild = process.env.NEXT_PHASE === "phase-production-build";
  const source = isBuild
    ? { ...BUILD_PLACEHOLDERS, ...stripEmpty(process.env) }
    : process.env;
  const parsed = safeParseEnv(source);
  if (!parsed.success) {
    const missing = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("\n  ");
    throw new Error(
      `Variables de entorno inválidas o faltantes:\n  ${missing}\n` +
        "Revisa .env.example para la guía de cada variable."
    );
  }
  cached = parsed.data;
  return cached;
}

function stripEmpty(env: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (v !== undefined && v !== "") out[k] = v;
  }
  return out;
}

/** true si el entorno de pruebas interno (mocks) está habilitado y NO es producción. */
export function isMockEnabled(): boolean {
  return (
    process.env.WA_MOCK_ENABLED === "true" &&
    process.env.NODE_ENV !== "production"
  );
}

/**
 * true si el ENTORNO trae proveedor de IA (`OPENROUTER_API_TOKEN` presente y
 * no vacío). Es solo el respaldo: lo que decide si una organización tiene IA
 * es `isAiConfiguredFor()` en `lib/ai/provider.ts`, que mira primero lo
 * guardado en Ajustes → IA.
 */
export function isAiConfiguredByEnv(): boolean {
  const token = process.env.OPENROUTER_API_TOKEN;
  return typeof token === "string" && token.trim().length > 0;
}
