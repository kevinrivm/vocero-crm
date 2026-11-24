import { eq } from "drizzle-orm";
import { apiError } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { requireBotKey, resolveInstanceOrg } from "@/server/bot/auth";
import { getCredentialsByOrg } from "@/server/whatsapp/credentials";
import {
  downloadGraphMedia,
  ensureAssetAvailable,
  leerAdjunto,
  MediaFetchError,
} from "@/server/whatsapp/media";

export const dynamic = "force-dynamic";

/** Límite para el bot (transcribe audio/imagen; nunca documentos de 100 MB). */
const MAX_MEDIA_BYTES = 16 * 1024 * 1024;

/** 074 — El id interno de un adjunto (`newId("mediaAsset")`). */
const ID_INTERNO = /^ma_[\w-]{1,60}$/;

/**
 * 006 (amendment 002) — Descarga de un adjunto de Meta para el bot.
 * GET /api/bot/media/{mediaId} → binario + content-type.
 *
 * El token de WhatsApp NO sale del CRM: el bot pide aquí, jamás a Meta.
 * Flujo Graph delegado al helper compartido (008): src/server/whatsapp/media.
 *
 * 074 — Con el id interno (`ma_…`) sirve un adjunto de Instagram, Messenger o
 * TikTok desde `MEDIA_DIR` (bajándolo primero si aún no está). No hace falta
 * que WhatsApp esté conectado.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ mediaId: string }> }
) {
  const denied = requireBotKey(req);
  if (denied) return denied;

  const organizationId = await resolveInstanceOrg();
  if (!organizationId) {
    return apiError(409, "no_org", "La instancia aún no tiene organización");
  }

  const { mediaId } = await ctx.params;
  if (!/^[\w.-]{1,64}$/.test(mediaId)) {
    return apiError(422, "invalid", "mediaId inválido");
  }

  if (ID_INTERNO.test(mediaId)) return adjuntoGuardado(organizationId, mediaId);

  const creds = await getCredentialsByOrg(organizationId);
  if (!creds) {
    return apiError(409, "no_connection", "WhatsApp no está conectado");
  }

  try {
    const { data, mimeType } = await downloadGraphMedia(
      creds.token,
      mediaId,
      MAX_MEDIA_BYTES
    );
    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": mimeType ?? "application/octet-stream",
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof MediaFetchError) {
      if (err.message.includes("límite")) {
        return apiError(413, "too_large", "El adjunto excede el límite de 16 MB");
      }
      return apiError(
        err.gone ? 404 : 502,
        "media_download_failed",
        err.message
      );
    }
    return apiError(502, "media_download_failed", "No se pudo descargar el adjunto");
  }
}

/** 074 — Un adjunto ya registrado en esta organización, por su id interno. */
async function adjuntoGuardado(organizationId: string, assetId: string): Promise<Response> {
  const [fila] = await getDb()
    .select()
    .from(schema.mediaAsset)
    .where(scoped(schema.mediaAsset.organizationId, organizationId, eq(schema.mediaAsset.id, assetId)))
    .limit(1);
  if (!fila || fila.kind === "location" || fila.kind === "contacts") {
    return apiError(404, "not_found", "Adjunto no encontrado");
  }
  const asset =
    fila.fetchStatus === "available"
      ? fila
      : ((await ensureAssetAvailable(organizationId, assetId)) ?? fila);
  if (asset.fetchStatus !== "available") {
    return apiError(404, "media_download_failed", "El adjunto ya no está disponible");
  }
  if ((asset.fileSize ?? 0) > MAX_MEDIA_BYTES) {
    return apiError(413, "too_large", "El adjunto excede el límite de 16 MB");
  }
  const leido = await leerAdjunto(organizationId, asset);
  if (!leido) return apiError(404, "media_download_failed", "El adjunto ya no está disponible");
  return new Response(new Uint8Array(leido.data), {
    headers: {
      "content-type": leido.asset.mimeType ?? "application/octet-stream",
      "cache-control": "no-store",
    },
  });
}
