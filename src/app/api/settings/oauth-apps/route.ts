import { withApiSettingsAuth } from "@/server/api-v1/ajustes";
import { listarApps } from "@/server/oauth/servidor";

export const dynamic = "force-dynamic";

/**
 * Ajustes → API → Apps conectadas: lo que se conectó por OAuth (claude.ai,
 * ChatGPT, Claude Code…). Como las llaves, solo existe donde la API está
 * encendida y solo la ve quien configura.
 */
export const GET = withApiSettingsAuth(async (session) => {
  return Response.json({ apps: await listarApps(session.organizationId) });
});
