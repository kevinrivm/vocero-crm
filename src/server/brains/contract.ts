import { createHmac, timingSafeEqual } from "node:crypto";
import { sourceUrlOf } from "@/server/inbox/remote-media";

/**
 * 021 — El contrato del despacho: lo que el CRM le manda a un cerebro externo
 * cuando un cliente escribe. Ver
 * `specs/021-despacho-estandar/contracts/despacho.md`. Este módulo define la
 * FORMA del evento y la firma; no habla con nadie ni toca la base.
 *
 * La regla que lo sostiene: el cerebro recibe un evento NORMALIZADO. No sabe
 * si el mensaje vino de Meta o de Zernio y no tiene credenciales de canal, así
 * que agregar un canal no toca a los cerebros y agregar un cerebro no toca a
 * los canales.
 *
 * Es la misma forma que el despacho de Vocero Cloud (su
 * `src/server/brains/contract.ts`), para que un mismo cerebro sirva a las dos
 * ediciones. La única diferencia está en `mediaId`, y se explica abajo.
 */

export type CanalDelEvento = "whatsapp" | "instagram" | "messenger" | "tiktok";

export type MensajeDelEvento = {
  id: string;
  at: string;
  type: string;
  text: string | null;
  /**
   * El id que acepta `GET /api/bot/media/{mediaId}` (el de Graph), no el id
   * interno del adjunto. En cloud es al revés porque allá la vuelta es
   * `/api/brains/media`; aquí la vuelta es `/api/bot/*` y no cambia.
   *
   * 074 — Un adjunto de Instagram, Messenger o TikTok no tiene id de Graph:
   * va el id interno (`ma_…`), que la misma ruta sirve desde `MEDIA_DIR`.
   */
  mediaId: string | null;
  /** Solo con adjunto. */
  mimeType?: string | null;
  /** Solo con adjunto. */
  caption?: string | null;
  /** 031 — Solo con adjunto que trae nombre de archivo (un PDF, casi siempre). */
  fileName?: string;
  /** 031 — Solo si `type` es `location`. */
  location?: UbicacionDelEvento;
  /** 031 — Solo si `type` es `contacts`: los nombres de las tarjetas. */
  contacts?: { name: string }[];
};

/**
 * 031 — Una ubicación compartida. `name` y `address` solo si Meta los mandó
 * (un pin suelto no los trae).
 */
export type UbicacionDelEvento = {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
};

export type EventoDespacho = {
  dispatchId: string;
  organization: { id: string; slug: string | null };
  conversation: {
    id: string;
    channel: CanalDelEvento;
    aiEnabled: boolean;
    windowOpen: boolean;
    windowExpiresAt: string | null;
    /**
     * 033 — Solo en una conversación de prueba del Laboratorio, y siempre
     * `true`. La respuesta se guarda y no se envía; el cerebro no debería
     * tratarla como un cliente (lista de permitidos, seguimiento).
     */
    test?: true;
  };
  contact: {
    id: string;
    displayName: string;
    identity: string;
  };
  messages: MensajeDelEvento[];
  firstMessageAt: string;
  lastMessageAt: string;
  /**
   * 075 — Lo que este CRM sabe hacer además del contrato base. Hoy, solo
   * `dispatch_superado`. Va al final para que el cuerpo fijado en las pruebas
   * gemelas (que no la lleva) siga siendo el mismo.
   */
  capabilities?: string[];
  /**
   * 075 — Solo cuando la red de seguridad vuelve a mandar un turno que quedó
   * sin contestar: 1 la primera vez, 2 la segunda. Son mensajes que el
   * cerebro ya recibió; no debe descartarlos por repetidos.
   */
  relaunch?: number;
  /** 076 — Hubo una persona: ver `AtencionHumana`. */
  humanAttention?: AtencionHumana;
};

/**
 * 076 — Una persona del equipo atendió la conversación mientras la IA estaba
 * en pausa. Opcional: solo viaja cuando la IA vuelve y todavía no contestó
 * desde que escribió la persona (`server/brains/atencion-humana.ts`). Un
 * cerebro que no lo conoce lo ignora; Nea lo usa para no contradecir al
 * equipo. Es la misma forma que manda Vocero Cloud, para que un cerebro sirva
 * a las dos ediciones.
 */
export type AtencionHumana = {
  /** El primer mensaje del equipo desde la última respuesta de la IA. */
  since: string;
  /** El último mensaje del equipo. */
  lastTeamMessageAt: string;
  /** Lo que se dijeron desde la última respuesta de la IA (sin la ráfaga), del más viejo al más nuevo. */
  messages: { at: string; author: "team" | "customer"; type: string; text: string | null }[];
};

/**
 * 075 — El CRM sabe callar la respuesta a un turno que el cliente ya dejó
 * atrás: si el cerebro manda `dispatchId` y `dropIfSuperseded: true` en
 * `POST /api/bot/messages` y ya hay un despacho posterior en esa conversación,
 * contesta `409 dispatch_superado` y no envía nada. Es la misma cadena que
 * anuncia Vocero Cloud, para que un cerebro sirva a las dos ediciones.
 */
export const CAPACIDAD_SUPERADO = "dispatch_superado";

/**
 * 076 — El CRM le avisa al cerebro cuando una persona del equipo atendió la
 * conversación (`humanAttention` en el despacho). Anunciarla dice que la
 * AUSENCIA del campo significa «no hubo persona», no «este CRM no sabe».
 */
export const CAPACIDAD_ATENCION_HUMANA = "atencion_humana";

/** 075 — Lo que viaja en `capabilities` de cada despacho. */
export function capacidadesDelCrm(): string[] {
  return [CAPACIDAD_SUPERADO, CAPACIDAD_ATENCION_HUMANA];
}

/** Lo que hace falta saber de un mensaje para meterlo al evento. */
export type MensajeParaEvento = {
  id: string;
  createdAt: Date;
  type: string;
  text: string | null;
  media: {
    waMediaId: string | null;
    mimeType: string | null;
    caption: string | null;
    /** 031 */
    fileName?: string | null;
    /** 031 — `media_asset.payload`: la ubicación o las tarjetas tal como llegaron. */
    payload?: unknown;
    /** 074 — Id interno del adjunto: el `mediaId` de los canales sociales. */
    assetId?: string | null;
  } | null;
};

/**
 * 074 — El `mediaId` de un mensaje: el de Graph en WhatsApp; el id interno si
 * el adjunto se copió de una URL (Instagram, Messenger, TikTok). Pura.
 */
export function mediaIdDelEvento(media: MensajeParaEvento["media"]): string | null {
  if (!media) return null;
  if (media.waMediaId) return media.waMediaId;
  return media.assetId && sourceUrlOf(media.payload) ? media.assetId : null;
}

/**
 * Arma el evento. Pura, y es la ÚNICA que lo arma: el orden de las claves es
 * contrato —se firma el JSON tal como sale de aquí— y
 * `tests/unit/despacho-contrato.test.ts` fija un cuerpo y su firma byte a
 * byte. La prueba gemela vive en el repo del cerebro.
 */
export function armarEvento(datos: {
  dispatchId: string;
  organization: { id: string; slug: string | null };
  conversation: {
    id: string;
    channel: CanalDelEvento;
    aiEnabled: boolean;
    windowOpen: boolean;
    windowExpiresAt: Date | null;
    /** 033 */
    test?: boolean;
  };
  contact: { id: string; displayName: string; identity: string };
  messages: MensajeParaEvento[];
  firstMessageAt: Date;
  lastMessageAt: Date;
  /** 075 */
  capabilities?: string[];
  /** 075 — 0 o ausente en un despacho normal. */
  relaunch?: number;
  /** 076 — Solo si hubo una persona del equipo. */
  humanAttention?: AtencionHumana | null;
}): EventoDespacho {
  return {
    dispatchId: datos.dispatchId,
    organization: {
      id: datos.organization.id,
      slug: datos.organization.slug,
    },
    conversation: {
      id: datos.conversation.id,
      channel: datos.conversation.channel,
      aiEnabled: datos.conversation.aiEnabled,
      windowOpen: datos.conversation.windowOpen,
      windowExpiresAt: datos.conversation.windowExpiresAt?.toISOString() ?? null,
      // 033 — Solo cuando aplica, al final: el cuerpo gemelo no cambia.
      ...(datos.conversation.test ? { test: true as const } : {}),
    },
    contact: {
      id: datos.contact.id,
      displayName: datos.contact.displayName,
      identity: datos.contact.identity,
    },
    messages: datos.messages.map(mensajeDelEvento),
    firstMessageAt: datos.firstMessageAt.toISOString(),
    lastMessageAt: datos.lastMessageAt.toISOString(),
    // 075 — Las llaves nuevas, al final y solo cuando vienen: el cuerpo
    // gemelo no cambia.
    ...(datos.capabilities?.length ? { capabilities: [...datos.capabilities] } : {}),
    ...(datos.relaunch && datos.relaunch > 0 ? { relaunch: datos.relaunch } : {}),
    // 076 — Solo si hubo una persona: sin ella el despacho no cambia de forma.
    ...(datos.humanAttention ? { humanAttention: datos.humanAttention } : {}),
  };
}

function mensajeDelEvento(m: MensajeParaEvento): MensajeDelEvento {
  const evento: MensajeDelEvento = {
    id: m.id,
    at: m.createdAt.toISOString(),
    type: m.type,
    text: m.text,
    mediaId: mediaIdDelEvento(m.media),
  };
  // Sin algo que descargar, `mimeType` y `caption` no dicen nada: una
  // ubicación o una tarjeta de contacto no tienen media id.
  if (m.media && evento.mediaId) {
    evento.mimeType = m.media.mimeType;
    evento.caption = m.media.caption;
    // 031 — Las llaves nuevas van SOLO cuando aplican, y siempre después de
    // las de antes: así el cuerpo fijado en la prueba gemela no cambia.
    if (m.media.fileName) evento.fileName = m.media.fileName;
  }
  if (m.type === "location") {
    const ubicacion = ubicacionDe(m.media?.payload);
    if (ubicacion) evento.location = ubicacion;
  }
  if (m.type === "contacts") {
    const nombres = nombresDeTarjetas(m.media?.payload);
    if (nombres.length) evento.contacts = nombres.map((name) => ({ name }));
  }
  return evento;
}

/**
 * 031 — La ubicación que el webhook de Meta guardó en `media_asset.payload`.
 * Tolerante: lo que no tenga coordenadas numéricas no es una ubicación.
 */
export function ubicacionDe(payload: unknown): UbicacionDelEvento | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.latitude !== "number" || typeof p.longitude !== "number") {
    return null;
  }
  const ubicacion: UbicacionDelEvento = {
    latitude: p.latitude,
    longitude: p.longitude,
  };
  if (typeof p.name === "string" && p.name.trim()) ubicacion.name = p.name.trim();
  if (typeof p.address === "string" && p.address.trim()) {
    ubicacion.address = p.address.trim();
  }
  return ubicacion;
}

/**
 * 031 — Los nombres de las tarjetas de contacto (`contacts[].name` de Meta):
 * el nombre con formato o, si falta, el de pila. Las que no traen ninguno se
 * omiten.
 */
export function nombresDeTarjetas(payload: unknown): string[] {
  if (!Array.isArray(payload)) return [];
  const nombres: string[] = [];
  for (const tarjeta of payload) {
    if (!tarjeta || typeof tarjeta !== "object") continue;
    const name = (tarjeta as { name?: unknown }).name;
    if (!name || typeof name !== "object") continue;
    const n = name as { formatted_name?: unknown; first_name?: unknown };
    const elegido =
      typeof n.formatted_name === "string" && n.formatted_name.trim()
        ? n.formatted_name.trim()
        : typeof n.first_name === "string" && n.first_name.trim()
          ? n.first_name.trim()
          : null;
    if (elegido) nombres.push(elegido);
  }
  return nombres;
}

/**
 * 026 — Quien administra el negocio eliminó una conversación: el cerebro tiene
 * que olvidarla.
 *
 * Viaja a la MISMA URL y con la MISMA firma que un despacho. Se distingue por
 * `type`, que un despacho no lleva: quien no conozca este evento ve un cuerpo
 * sin `messages` y lo rechaza, que es inofensivo — no se reintenta.
 *
 * No lleva el contenido de lo borrado, solo con qué encontrarlo. `identity` va
 * porque un cerebro suele indexar su memoria por persona, no por el id de
 * conversación del CRM.
 */
export type EventoOlvido = {
  type: "conversation.deleted";
  eventId: string;
  organization: { id: string; slug: string | null };
  conversation: { id: string; channel: CanalDelEvento };
  contact: { id: string; identity: string };
  deletedAt: string;
};

export const TIPO_OLVIDO = "conversation.deleted" as const;

/**
 * El orden de las claves es contrato: se firma el JSON tal como sale de aquí.
 * Es el mismo cuerpo que manda Vocero Cloud, y la prueba gemela de `nea-agent`
 * (`tests/test_olvido.py`) lo tiene copiado byte a byte, igual que
 * `tests/unit/olvido-contrato.test.ts` aquí.
 */
export function construirEventoOlvido(datos: {
  eventId: string;
  organization: { id: string; slug: string | null };
  conversation: { id: string; channel: CanalDelEvento };
  contact: { id: string; identity: string };
  deletedAt: Date;
}): EventoOlvido {
  return {
    type: TIPO_OLVIDO,
    eventId: datos.eventId,
    organization: {
      id: datos.organization.id,
      slug: datos.organization.slug,
    },
    conversation: {
      id: datos.conversation.id,
      channel: datos.conversation.channel,
    },
    contact: { id: datos.contact.id, identity: datos.contact.identity },
    deletedAt: datos.deletedAt.toISOString(),
  };
}

export const CABECERA_FIRMA = "x-vocero-signature";
export const CABECERA_DISPATCH = "x-vocero-dispatch-id";
export const CABECERA_ORG = "x-vocero-organization";
/** Para los eventos que no son un turno: hoy, `conversation.deleted` (026). */
export const CABECERA_EVENTO = "x-vocero-event";

/**
 * Firma del cuerpo CRUDO, con prefijo `sha256=`.
 *
 * El prefijo es contrato: el webhook de Zernio NO lo lleva y el nuestro SÍ. La
 * asimetría es del proveedor, no nuestra.
 */
export function firmarCuerpo(cuerpoCrudo: string, secreto: string): string {
  const hex = createHmac("sha256", secreto)
    .update(cuerpoCrudo, "utf8")
    .digest("hex");
  return `sha256=${hex}`;
}

/**
 * Verificación en tiempo constante. El CRM no verifica sus propios despachos:
 * existe para que el cerebro de prueba del arnés y las pruebas comprueben la
 * firma con la misma regla que debe usar un cerebro real.
 */
export function firmaValida(
  cuerpoCrudo: string,
  secreto: string,
  firmaRecibida: string | null
): boolean {
  if (!firmaRecibida) return false;
  const esperada = Buffer.from(firmarCuerpo(cuerpoCrudo, secreto));
  const recibida = Buffer.from(firmaRecibida);
  if (esperada.length !== recibida.length) return false;
  return timingSafeEqual(esperada, recibida);
}

/**
 * Cómo se clasifica lo que respondió el cerebro.
 *
 * Un 4xx (salvo 429) NO se reintenta: si el otro lado considera inválido el
 * cuerpo, mandárselo tres veces solo retrasa la caída a humano, que es lo
 * único que va a atender esa conversación. Un 3xx cae aquí también: no se
 * siguen redirecciones.
 */
export type ResultadoEntrega =
  | { ok: true }
  | { ok: false; reintentable: boolean; detalle: string };

export function clasificarRespuesta(status: number): ResultadoEntrega {
  if (status >= 200 && status < 300) return { ok: true };
  if (status === 429 || status >= 500) {
    return {
      ok: false,
      reintentable: true,
      detalle: `el cerebro respondió ${status}`,
    };
  }
  return {
    ok: false,
    reintentable: false,
    detalle: `el cerebro respondió ${status} (no se reintenta)`,
  };
}
