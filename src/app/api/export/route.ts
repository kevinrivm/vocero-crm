import { withAuth } from "@/lib/api";
import { buildOrganizationExport } from "@/server/export/org-export";
import { createLogger } from "@/lib/logger";

const log = createLogger("export");

export const dynamic = "force-dynamic";

/**
 * GET /api/export — dump JSON de los datos del negocio de la sesión.
 * Solo lectura, solo la organización autenticada. Sin credenciales y sin
 * datos de prueba del Laboratorio (ver org-export.ts).
 *
 * Se sirve siempre como adjunto con nombre fechado: el botón de Ajustes lo
 * descarga con un <a href> plano, sin fetch/JS extra.
 */
export const GET = withAuth(async (session) => {
  try {
    const dump = await buildOrganizationExport(session.organizationId);
    const body = JSON.stringify(dump, null, 2);
    const date = new Date().toISOString().slice(0, 10);
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="vocero-export-${date}.json"`,
      },
    });
  } catch (err) {
    log.error("export falló", { err });
    return Response.json(
      { error: { code: "export_failed", message: "No se pudo generar el export" } },
      { status: 500 }
    );
  }
});
