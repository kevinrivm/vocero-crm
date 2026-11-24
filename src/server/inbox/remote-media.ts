import { BlockList, isIP } from "node:net";

/**
 * 074 — Adjuntos de Instagram, Messenger y TikTok.
 *
 * Ni Meta (directo) ni Zernio entregan un id de media que se pueda pedir más
 * tarde, como hace WhatsApp: mandan una URL firmada que caduca en horas. Si no
 * se copia al llegar, se pierde. La URL se guarda en
 * `media_asset.payload.sourceUrl` (con su `origen`) y se copia a `MEDIA_DIR`
 * en segundo plano, igual que un adjunto de WhatsApp (`ensureAssetAvailable`).
 *
 * Todo aquí es puro, para poder probar sin base de datos ni red qué parte de
 * un mensaje se vuelve qué mensaje de la bandeja y qué URL se puede bajar.
 */

/** De dónde llegó el adjunto: decide qué hosts se aceptan al bajarlo. */
export type OrigenRemoto = "meta" | "zernio";

/** Tipos de adjunto que tienen archivo y se copian. */
export type KindRemoto = "image" | "video" | "audio" | "document" | "sticker";

/**
 * Un adjunto como lo mandan las dos fuentes: Zernio `{ type, url }` y Meta
 * `{ type, payload: { url, sticker_id, title } }`.
 */
export type RemoteAttachment = {
  type?: string;
  url?: string;
  payload?: {
    url?: string;
    sticker_id?: number;
    title?: string;
  } | null;
};

/** Lo que necesita la ingesta para crear el `media_asset` de una parte. */
export type RemoteMedia = {
  kind: KindRemoto;
  sourceUrl: string;
  origen: OrigenRemoto;
};

/** Una parte del mensaje original, lista para la ingesta. */
export type InboundPart = {
  /** Se agrega al id del mensaje: "" para la primera parte, `#2`, `#3`… */
  idSuffix: string;
  type: string;
  text: string | null;
  media: RemoteMedia | null;
};

/** Tipo de adjunto de la plataforma → tipo de mensaje (y de adjunto) del CRM. */
const KIND: Record<string, KindRemoto> = {
  image: "image",
  photo: "image",
  gif: "image",
  animated_image_share: "image",
  video: "video",
  audio: "audio",
  voice: "audio",
  file: "document",
  document: "document",
  sticker: "sticker",
  // Instagram: el corazón («like») es una imagen animada del CDN.
  like_heart: "sticker",
};

/**
 * Adjuntos que apuntan a algo que ya vive en la plataforma (una publicación,
 * un reel, una historia): no hay archivo que copiar, pero el enlace le sirve
 * al equipo para abrirlo.
 */
const COMPARTIDOS: Record<string, string> = {
  share: "Compartió una publicación",
  ig_post: "Compartió una publicación",
  ig_reel: "Compartió un reel",
  reel: "Compartió un reel",
  story_mention: "Te mencionó en su historia",
  fallback: "Compartió un enlace",
};

function urlOf(att: RemoteAttachment): string | null {
  const url = att.url ?? att.payload?.url;
  return typeof url === "string" && url.length > 0 ? url : null;
}

/**
 * Parte un mensaje en uno por texto y uno por adjunto, en orden. La primera
 * parte conserva el id original: así una reentrega de un mensaje que ya entró
 * con la versión anterior (que guardaba solo la primera) no se duplica, y las
 * siguientes llevan `#2`, `#3`…, estables entre reentregas.
 *
 * `noSoportado` es el `is_unsupported` de Instagram: Meta avisa que llegó algo
 * pero no manda qué. Se guarda igual, para que no desaparezca sin rastro.
 */
export function splitInbound(
  text: string | null,
  attachments: readonly RemoteAttachment[] | null | undefined,
  origen: OrigenRemoto,
  noSoportado = false
): InboundPart[] {
  const parts: Omit<InboundPart, "idSuffix">[] = [];
  if (text) parts.push({ type: "text", text, media: null });

  for (const att of Array.isArray(attachments) ? attachments : []) {
    if (!att || typeof att !== "object") continue;
    const url = urlOf(att);
    const tipo = (att.type ?? "").toLowerCase();
    const kind = att.payload?.sticker_id ? "sticker" : KIND[tipo];

    if (kind && url) {
      parts.push({ type: kind, text: null, media: { kind, sourceUrl: url, origen } });
    } else if (COMPARTIDOS[tipo]) {
      const titulo = att.payload?.title?.trim();
      const linea = [COMPARTIDOS[tipo], titulo].filter(Boolean).join(": ");
      parts.push({ type: "text", text: url ? `${linea}\n${url}` : linea, media: null });
    } else if (kind) {
      // Tipo conocido sin URL: queda la marca para que se vea que llegó algo.
      parts.push({ type: kind, text: null, media: null });
    } else {
      parts.push({ type: "unsupported", text: null, media: null });
    }
  }

  if (parts.length === 0 && noSoportado) {
    parts.push({ type: "unsupported", text: null, media: null });
  }

  return parts.map((p, i) => ({ ...p, idSuffix: i === 0 ? "" : `#${i + 1}` }));
}

/**
 * Qué parte de un grupo despierta al cerebro. Solo la ÚLTIMA (nueve fotos
 * juntas son un turno, con las nueve en la ráfaga), y solo si en el grupo hay
 * algo que el cerebro pueda leer: si todo es `unsupported`, nadie despierta y
 * el mensaje queda en la bandeja para una persona.
 */
export function despiertaLaParte(
  partes: readonly Pick<InboundPart, "type">[],
  i: number
): boolean {
  if (i !== partes.length - 1) return false;
  return partes.some((p) => p.type !== "unsupported");
}

/** La URL de origen guardada en el payload de un asset, si la tiene. */
export function sourceUrlOf(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const url = (payload as { sourceUrl?: unknown }).sourceUrl;
  return typeof url === "string" && url.length > 0 ? url : null;
}

/** El origen guardado junto a la URL. Sin él, el más estricto: Meta. */
export function origenOf(payload: unknown): OrigenRemoto {
  const o = payload && typeof payload === "object" ? (payload as { origen?: unknown }).origen : null;
  return o === "zernio" ? "zernio" : "meta";
}

/**
 * El payload que se enseña a la bandeja: sin la URL firmada de origen ni su
 * origen. No le sirven a nadie fuera del servidor y caducan; la bandeja pide
 * el archivo por `/api/media/{id}`.
 */
export function payloadPublico(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload ?? null;
  if (!("sourceUrl" in payload)) return payload;
  const resto: Record<string, unknown> = { ...(payload as Record<string, unknown>) };
  delete resto.sourceUrl;
  delete resto.origen;
  return Object.keys(resto).length ? resto : null;
}

/**
 * Dominios desde los que Meta sirve los adjuntos de Instagram y Messenger
 * (los mismos de los creativos de anuncios, 018).
 */
const DOMINIOS_DE_META = [
  "fbcdn.net",
  "fbsbx.com",
  "facebook.com",
  "cdninstagram.com",
  "instagram.com",
];

/**
 * ¿Se puede pedir esta URL? Revisa la forma; la IP a la que resuelve la revisa
 * `ipPublica` al conectar.
 *
 * - Meta directo: solo https a un host de Meta.
 * - Zernio: https a cualquier host con nombre (Zernio y TikTok sirven desde
 *   CDNs que no son de Meta), nunca a una IP escrita ni a un nombre local.
 *
 * `origenMock` es el origen del simulador y solo se pasa con los mocks
 * habilitados, que en producción no existen (`isMockEnabled`).
 */
export function urlDeAdjuntoPermitida(
  raw: string,
  origen: OrigenRemoto,
  origenMock: string | null = null
): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.username || u.password) return false;
  if (origenMock && u.origin === origenMock) return true;
  if (u.protocol !== "https:") return false;
  if (u.port !== "" && u.port !== "443") return false;
  const h = u.hostname.toLowerCase().replace(/\.$/, "");
  if (origen === "meta") {
    return DOMINIOS_DE_META.some((d) => h === d || h.endsWith(`.${d}`));
  }
  if (isIP(h.replace(/^\[|\]$/g, "")) !== 0) return false;
  if (!h.includes(".")) return false;
  return !/(^|\.)(localhost|local|internal|lan|home|corp|intranet)$/.test(h);
}

/** Redes que nunca se piden desde el servidor (red interna, loopback, etc.). */
const PRIVADAS = (() => {
  const b = new BlockList();
  for (const [red, prefijo] of [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["224.0.0.0", 3],
  ] as const) {
    b.addSubnet(red, prefijo, "ipv4");
  }
  for (const [red, prefijo] of [
    ["::", 127],
    ["fc00::", 7],
    ["fe80::", 10],
    ["ff00::", 8],
  ] as const) {
    b.addSubnet(red, prefijo, "ipv6");
  }
  return b;
})();

/** true si la IP es de internet (no privada, loopback, enlace local…). */
export function ipPublica(ip: string): boolean {
  const familia = isIP(ip);
  if (familia === 4) return !PRIVADAS.check(ip, "ipv4");
  if (familia === 6) {
    const v4 = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    if (v4) return !PRIVADAS.check(v4, "ipv4");
    return !PRIVADAS.check(ip, "ipv6");
  }
  return false;
}

/**
 * Topes de lo que se copia. Meta y TikTok aceptan adjuntos de hasta 25 MB en
 * un DM; una foto del CDN ronda 100-500 KB. Lo que pasa del tope no se baja:
 * el mensaje se queda, con el adjunto como no disponible.
 */
export const TOPE_ADJUNTO_REMOTO: Record<KindRemoto, number> = {
  image: 10 * 1024 * 1024,
  sticker: 2 * 1024 * 1024,
  audio: 25 * 1024 * 1024,
  video: 25 * 1024 * 1024,
  document: 25 * 1024 * 1024,
};
