import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { borrarMedia, guardarMedia, leerMedia, rutaEnDisco } from "@/lib/storage/medios";
import { graphRequest, MetaApiError } from "@/lib/meta/client";
import {
  getCredentialsByOrg,
  type Credentials,
} from "@/server/whatsapp/credentials";
import { isForbiddenUploadMime } from "@/server/whatsapp/media-headers";
import { descargarAdjuntoRemoto } from "@/server/inbox/descarga-remota";
import {
  origenOf,
  sourceUrlOf,
  TOPE_ADJUNTO_REMOTO,
  type KindRemoto,
} from "@/server/inbox/remote-media";

/**
 * 008 — Única frontera de media con la Graph API (constitución II: todo el
 * tráfico a Meta pasa por adaptadores dedicados) + persistencia propia. Meta
 * expira sus archivos (~30 días, URLs de minutos): la copia propia es la
 * durable que la UI previsualiza.
 *
 * 037 — Esa copia vive en el disco (`MEDIA_DIR`) o en un bucket S3-compatible
 * (`MEDIA_STORE=bucket`): lo decide `src/lib/storage/medios.ts`, que escribe
 * donde diga la bandera y lee en los dos sitios. Estas funciones conservan su
 * nombre para no tocar a quien las llama.
 */

export type MediaKind = (typeof schema.mediaAsset.$inferSelect)["kind"];

/** Límites de la Cloud API por tipo (validados ANTES de tocar red, FR-007). */
export const MEDIA_LIMITS: Record<
  Exclude<MediaKind, "location" | "contacts">,
  { maxBytes: number; mimes: RegExp; label: string }
> = {
  image: {
    maxBytes: 5 * 1024 * 1024,
    mimes: /^image\/(jpeg|png|webp)$/,
    label: "imagen (jpeg/png/webp, máx. 5 MB)",
  },
  sticker: {
    maxBytes: 100 * 1024,
    mimes: /^image\/webp$/,
    label: "sticker (webp, máx. 100 KB)",
  },
  audio: {
    maxBytes: 16 * 1024 * 1024,
    mimes: /^audio\/(aac|mp4|mpeg|amr|ogg|opus)/,
    label: "audio (aac/mp4/mpeg/amr/ogg, máx. 16 MB)",
  },
  video: {
    maxBytes: 16 * 1024 * 1024,
    mimes: /^video\/(mp4|3gpp)$/,
    label: "video (mp4/3gpp, máx. 16 MB)",
  },
  document: {
    maxBytes: 100 * 1024 * 1024,
    mimes: /^[\w.-]+\/[\w.+-]+$/,
    label: "documento (máx. 100 MB)",
  },
};

/** Clasifica un MIME de archivo saliente al tipo de mensaje de la Cloud API. */
export function kindFromMime(mime: string): "image" | "audio" | "video" | "document" {
  if (MEDIA_LIMITS.image.mimes.test(mime)) return "image";
  if (MEDIA_LIMITS.audio.mimes.test(mime)) return "audio";
  if (MEDIA_LIMITS.video.mimes.test(mime)) return "video";
  return "document";
}

export class MediaValidationError extends Error {
  code: "too_large" | "unsupported_type";
  constructor(code: MediaValidationError["code"], message: string) {
    super(message);
    this.name = "MediaValidationError";
    this.code = code;
  }
}

/**
 * Valida MIME y tamaño para envío; devuelve el kind resuelto. Los formatos
 * que WhatsApp no acepta como su tipo nativo (p. ej. image/bmp) van como
 * documento — igual que hace la app de WhatsApp. HTML y SVG no van ni como
 * documento (#78): el navegador de quien los abra los trataría como una
 * página, y se servirían desde el origen del CRM.
 */
export function validateOutgoing(mimeConParametros: string, sizeBytes: number) {
  // 044: `audio/ogg; codecs=opus` (la nota de voz, o lo que graba Firefox)
  // trae parámetros; el tipo es lo de antes del `;`.
  const mime = mimeConParametros.split(";")[0]!.trim();
  if (!/^[\w.-]+\/[\w.+-]+$/.test(mime)) {
    throw new MediaValidationError("unsupported_type", "Tipo de archivo no reconocido");
  }
  if (isForbiddenUploadMime(mime)) {
    throw new MediaValidationError(
      "unsupported_type",
      "Los archivos HTML y SVG no se pueden enviar como adjunto: un navegador los abriría como página. Conviértelo a PDF o a imagen"
    );
  }
  const kind = kindFromMime(mime);
  const limit = MEDIA_LIMITS[kind];
  if (sizeBytes > limit.maxBytes) {
    throw new MediaValidationError(
      "too_large",
      `El archivo excede el límite de ${limit.label}`
    );
  }
  return kind;
}

/* ---------- Disco local ---------- */

/** Ruta absoluta del archivo de un asset en el volumen local (solo el disco). */
export function mediaFilePath(organizationId: string, assetId: string): string {
  return rutaEnDisco(organizationId, assetId);
}

/** Guarda el binario donde toque y devuelve la ruta relativa que va a la BD. */
export async function saveMediaFile(
  organizationId: string,
  assetId: string,
  data: Buffer | Uint8Array,
  contentType?: string
): Promise<string> {
  return guardarMedia(organizationId, assetId, data, contentType);
}

/** Lee el binario, del bucket o del disco (037: en los dos sitios). */
export async function readMediaFile(organizationId: string, assetId: string): Promise<Buffer> {
  return leerMedia(organizationId, assetId);
}

/**
 * 018 — Borra el archivo de un asset. Sin error si ya no estaba: quien lo
 * llama está deshaciendo una copia que sobró, y un archivo que no existe es
 * justo el estado al que quiere llegar. 037 — En los dos sitios.
 */
export async function deleteMediaFile(organizationId: string, assetId: string): Promise<void> {
  await borrarMedia(organizationId, assetId);
}

/* ---------- Descarga desde Graph (entrantes y echoes) ---------- */

type GraphMediaMeta = { url?: string; mime_type?: string; file_size?: number };

export class MediaFetchError extends Error {
  /** true si Meta ya no tiene el archivo (expirado/borrado) — no reintentar. */
  gone: boolean;
  constructor(message: string, gone = false) {
    super(message);
    this.name = "MediaFetchError";
    this.gone = gone;
  }
}

/**
 * Descarga un media de Graph: GET {mediaId} → url efímera → GET con Bearer.
 * El token JAMÁS sale del servidor.
 */
export async function downloadGraphMedia(
  token: string,
  waMediaId: string,
  maxBytes: number = MEDIA_LIMITS.document.maxBytes
): Promise<{ data: Buffer; mimeType: string | null; fileSize: number }> {
  let meta: GraphMediaMeta;
  try {
    meta = await graphRequest<GraphMediaMeta>(waMediaId, { token });
  } catch (err) {
    const gone = err instanceof MetaApiError && err.status === 404;
    throw new MediaFetchError("Meta no entregó la metadata del adjunto", gone);
  }
  if (!meta.url) throw new MediaFetchError("Meta no entregó URL del adjunto");
  if (meta.file_size && meta.file_size > maxBytes) {
    throw new MediaFetchError("El adjunto excede el límite de tamaño", true);
  }

  let res: Response;
  try {
    res = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new MediaFetchError("No se pudo descargar el adjunto");
  }
  if (!res.ok) {
    throw new MediaFetchError(
      `La descarga devolvió ${res.status}`,
      res.status === 404 || res.status === 410
    );
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > maxBytes) {
    throw new MediaFetchError("El adjunto excede el límite de tamaño", true);
  }
  return {
    data: buf,
    mimeType: meta.mime_type ?? res.headers.get("content-type"),
    fileSize: buf.byteLength,
  };
}

/**
 * Garantiza que el asset esté en disco (`fetchStatus=available`).
 * Se usa en la descarga in-process post-ingesta Y on-demand desde la ruta de
 * media. Nunca lanza hacia el webhook: el que llama decide qué hacer con el
 * resultado. Devuelve el asset actualizado o null si no se pudo.
 */
export async function ensureAssetAvailable(
  organizationId: string,
  assetId: string,
  /**
   * Bajarlo aunque figure como disponible: el archivo se perdió (volumen sin
   * montar, restauración a medias) y la fila todavía no lo sabe.
   */
  opts: { forzar?: boolean } = {}
): Promise<typeof schema.mediaAsset.$inferSelect | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.mediaAsset)
    .where(eq(schema.mediaAsset.id, assetId))
    .limit(1);
  const asset = rows[0];
  if (!asset || asset.organizationId !== organizationId) return null;
  if (asset.fetchStatus === "available" && !opts.forzar) return asset;

  // 074: Instagram, Messenger y TikTok traen una URL firmada en vez de un id
  // de Graph. location/contacts no tienen ninguna de las dos: no hay binario.
  const sourceUrl = sourceUrlOf(asset.payload);
  if (!asset.waMediaId && !sourceUrl) return null;

  let descargar: () => Promise<{ data: Buffer; mimeType: string | null; fileSize: number }>;
  if (asset.waMediaId) {
    const creds = await getCredentialsByOrg(organizationId);
    if (!creds) return null;
    const waMediaId = asset.waMediaId;
    descargar = () => downloadGraphMedia(creds.token, waMediaId);
  } else {
    const tope = TOPE_ADJUNTO_REMOTO[asset.kind as KindRemoto] ?? TOPE_ADJUNTO_REMOTO.document;
    const origen = origenOf(asset.payload);
    descargar = () => descargarAdjuntoRemoto(sourceUrl!, origen, tope);
  }

  try {
    const { data, mimeType, fileSize } = await descargar();
    const storagePath = await saveMediaFile(organizationId, assetId, data, mimeType ?? undefined);
    const updated = await db
      .update(schema.mediaAsset)
      .set({
        storagePath,
        mimeType: asset.mimeType ?? mimeType,
        fileSize,
        fetchStatus: "available",
        fetchError: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.mediaAsset.id, assetId))
      .returning();
    return updated[0] ?? null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(schema.mediaAsset)
      .set({ fetchStatus: "failed", fetchError: message, updatedAt: new Date() })
      .where(eq(schema.mediaAsset.id, assetId));
    console.warn(`[media] descarga del asset ${assetId} falló: ${message}`);
    return null;
  }
}

/**
 * Lee el archivo de un adjunto ya disponible.
 *
 * Si la base dice «disponible» pero el archivo no está —el contenedor se
 * redesplegó sin un volumen en `/data` y se llevó los adjuntos—, se vuelve a
 * bajar de Meta una vez, que los conserva unos 30 días. Sin esto, el adjunto
 * quedaba en 410 para siempre aunque Meta todavía lo tuviera. `null` si ni
 * así se puede: el archivo ya no existe en ningún lado.
 */
export async function leerAdjunto(
  organizationId: string,
  asset: typeof schema.mediaAsset.$inferSelect
): Promise<{ asset: typeof schema.mediaAsset.$inferSelect; data: Buffer } | null> {
  try {
    return { asset, data: await readMediaFile(organizationId, asset.id) };
  } catch {
    // El archivo no está: se intenta recuperar de Meta.
  }
  const recuperado = await ensureAssetAvailable(organizationId, asset.id, { forzar: true });
  if (!recuperado || recuperado.fetchStatus !== "available") return null;
  try {
    const data = await readMediaFile(organizationId, asset.id);
    console.log(`[media] ${asset.id} no estaba en el volumen; se recuperó de Meta`);
    return { asset: recuperado, data };
  } catch {
    return null;
  }
}

/* ---------- Subida a Graph (salientes) ---------- */

/**
 * Sube un archivo a Graph (`POST /{phone_number_id}/media`, multipart) y
 * devuelve el media id para usar en /messages. Errores → MetaApiError (la
 * capa de envío los traduce con las mismas reglas que el texto).
 */
export async function uploadGraphMedia(
  credentials: Credentials,
  file: { data: Buffer | Uint8Array; mimeType: string; fileName?: string }
): Promise<string> {
  const env = getEnv();
  const url = `${env.META_GRAPH_BASE_URL}/${env.META_GRAPH_API_VERSION}/${credentials.phoneNumberId}/media`;
  const form = new FormData();
  form.set("messaging_product", "whatsapp");
  form.set("type", file.mimeType);
  const bytes = new Uint8Array(file.data);
  form.set(
    "file",
    new Blob([bytes], { type: file.mimeType }),
    file.fileName ?? "adjunto"
  );

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${credentials.token}` },
      body: form,
    });
  } catch (cause) {
    throw new MetaApiError("No se pudo contactar la API de Meta", {
      status: 0,
      details: cause,
    });
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  if (!res.ok) {
    const err = (json as { error?: { message?: string; code?: number; type?: string } })
      ?.error;
    throw new MetaApiError(err?.message ?? `Meta respondió ${res.status}`, {
      status: res.status,
      code: err?.code ?? null,
      type: err?.type ?? null,
      details: json ?? text,
    });
  }
  const id = (json as { id?: string })?.id;
  if (!id) {
    throw new MetaApiError("Meta no devolvió ID del media subido", {
      status: res.status,
    });
  }
  return id;
}
