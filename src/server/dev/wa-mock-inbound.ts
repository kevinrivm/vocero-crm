import { createHmac } from "node:crypto";
import { getEnv } from "@/lib/env";
import { nextN } from "@/server/dev/wa-mock-state";

/**
 * Construye un payload real de Meta y lo entrega al webhook público por
 * loopback (127.0.0.1: mismo proceso, sin salir a la red). Se firma con el
 * META_APP_SECRET real si está configurado — así el self-test ejercita la
 * capa 2 de verdad.
 */
export async function deliverToWebhook(payload: unknown): Promise<Response> {
  const env = getEnv();
  const raw = JSON.stringify(payload);
  const port = process.env.PORT ?? "3000";
  const url = `http://127.0.0.1:${port}/api/webhooks/wa/${env.META_WEBHOOK_VERIFY_TOKEN}`;

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (env.META_APP_SECRET) {
    const sig = createHmac("sha256", env.META_APP_SECRET)
      .update(raw, "utf8")
      .digest("hex");
    headers["x-hub-signature-256"] = `sha256=${sig}`;
  }
  return fetch(url, { method: "POST", headers, body: raw });
}

/** 008 — Campos de adjunto que aceptan los payloads simulados. */
type MockMediaInput = {
  /** media id de Graph simulado (servible por wa-mock/media-file). */
  mediaId?: string;
  mimeType?: string;
  caption?: string;
  filename?: string;
  location?: Record<string, unknown>;
  /** 031 — Las tarjetas de un mensaje `contacts`, con la forma de Meta. */
  contacts?: Record<string, unknown>[];
};

/**
 * #78 — Respuestas de botón con la forma de Meta. `button` es la respuesta a
 * un botón de plantilla; `interactive` se pasa entero (como el `referral`)
 * para poder probar `button_reply`, `list_reply` y las formas rotas.
 */
type MockButtonInput = {
  /** 072 — reacción del cliente: el wamid al que reacciona y el emoji ("" = quitar). */
  reaction?: { messageId: string; emoji: string };
  button?: { text: string; payload?: string };
  interactive?: Record<string, unknown>;
};

const MOCK_BINARY_TYPES = new Set(["image", "video", "audio", "document", "sticker"]);

function applyMockContent(
  message: Record<string, unknown>,
  type: string,
  input: { text?: string } & MockMediaInput & MockButtonInput
): void {
  if (type === "text") {
    message.text = { body: input.text ?? "hola" };
  } else if (type === "reaction") {
    message.reaction = {
      message_id: input.reaction?.messageId ?? "wamid.mock.desconocido",
      emoji: input.reaction?.emoji ?? "",
    };
  } else if (type === "button") {
    // Como lo manda Meta: `context` apunta a la plantilla que traía el botón.
    const text = input.button?.text ?? input.text ?? "Sí";
    message.context = { from: "5215500000000", id: `wamid.mock.tpl.${nextN()}` };
    message.button = { payload: input.button?.payload ?? text, text };
  } else if (type === "interactive") {
    message.context = { from: "5215500000000", id: `wamid.mock.int.${nextN()}` };
    message.interactive = input.interactive ?? {
      type: "button_reply",
      button_reply: { id: "btn_mock", title: input.text ?? "Sí" },
    };
  } else if (type === "location") {
    message.location = input.location ?? {
      latitude: 21.019,
      longitude: -101.257,
      name: "Oficina",
    };
  } else if (type === "contacts") {
    message.contacts = input.contacts ?? [
      { name: { formatted_name: "Luis Gómez", first_name: "Luis" } },
    ];
  } else if (MOCK_BINARY_TYPES.has(type)) {
    const media: Record<string, unknown> = {
      id: input.mediaId ?? `mockmedia_${nextN()}`,
      mime_type:
        input.mimeType ?? (type === "audio" ? "audio/ogg" : "image/jpeg"),
    };
    if (input.caption) media.caption = input.caption;
    if (input.filename) media.filename = input.filename;
    message[type] = media;
  }
}

/** 016 — Campos para simular que el mensaje vino de un anuncio CTWA. */
type MockReferralInput = {
  /** Identificador del clic. Sin él no hay nada que reportarle a Meta. */
  ctwaClid?: string;
  adHeadline?: string;
  adSourceId?: string;
  /**
   * 018 — El `referral` tal cual lo mandaría Meta. Gana sobre los campos de
   * arriba y se pasa entero, no campo por campo, para poder probar también las
   * formas raras (sin `source_id`, cadenas gigantes, tipos equivocados) y la
   * URL del creativo.
   */
  referral?: Record<string, unknown>;
};

export function buildInboundPayload(input: {
  wabaId: string;
  phoneNumberId: string;
  /** Teléfono del remitente. Omite y usa `fromUserId` para simular BSUID (003). */
  from?: string;
  /** BSUID del remitente — puede venir solo o junto a `from`. */
  fromUserId?: string;
  name?: string;
  type?: string;
  text?: string;
  waMessageId?: string;
  timestamp?: number;
  /** 039 — `wamid` del mensaje que el cliente cita (va en `context.id`). */
  replyTo?: string;
  /**
   * 074 — Campos crudos del mensaje tal cual los mandaría Meta (`edit`,
   * `errors` de un `unsupported`, el cuerpo de una encuesta…). Se mezclan al
   * final, encima de lo demás.
   */
  extra?: Record<string, unknown>;
} & MockMediaInput &
  MockReferralInput &
  MockButtonInput) {
  const type = input.type ?? "text";
  const message: Record<string, unknown> = {
    id: input.waMessageId ?? `wamid.mock.in.${nextN()}`,
    timestamp: String(input.timestamp ?? Math.floor(Date.now() / 1000)),
    type,
  };
  if (input.from) message.from = input.from;
  if (input.fromUserId) message.from_user_id = input.fromUserId;
  applyMockContent(message, type, input);
  if (input.replyTo) message.context = { from: input.from, id: input.replyTo };
  if (input.extra) Object.assign(message, input.extra);

  // 016 — El referral solo viaja cuando la conversación nació de un anuncio, y
  // normalmente solo en el primer mensaje. Se arma igual que el real para que
  // la ingesta no sepa que habla con un mock.
  if (input.referral) {
    message.referral = input.referral;
  } else if (input.ctwaClid || input.adHeadline || input.adSourceId) {
    message.referral = {
      source_type: "ad",
      source_id: input.adSourceId ?? "1200000000000",
      source_url: "https://fb.me/anuncio-de-prueba",
      headline: input.adHeadline ?? "Anuncio de prueba",
      body: "Escríbenos por WhatsApp",
      media_type: "image",
      ...(input.ctwaClid ? { ctwa_clid: input.ctwaClid } : {}),
    };
  }

  const contactEntry: Record<string, unknown> = {
    /**
     * Sin nombre pedido, el payload va SIN `profile` — como el de Meta.
     *
     * Antes se inventaba «Cliente», y eso dejó de ser inofensivo en cuanto el
     * nombre del contacto pasó a mantenerse al día con el perfil (#51): un
     * segundo mensaje de la misma persona lo renombraba a «Cliente», que es
     * algo que Meta no manda nunca. Un mock que inventa datos acaba probando
     * su propia ficción.
     */
    ...(input.name ? { profile: { name: input.name } } : {}),
  };
  if (input.from) contactEntry.wa_id = input.from;
  if (input.fromUserId) contactEntry.user_id = input.fromUserId;

  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: input.wabaId,
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "5215500000000",
                phone_number_id: input.phoneNumberId,
              },
              contacts: [contactEntry],
              messages: [message],
            },
          },
        ],
      },
    ],
  };
}

/**
 * 008 — Payload de echo de coexistence (`smb_message_echoes`): un mensaje que
 * el dueño mandó A MANO desde la app de WhatsApp Business del teléfono.
 */
export function buildEchoPayload(input: {
  wabaId: string;
  phoneNumberId: string;
  /** wa_id del LEAD destinatario. */
  to: string;
  /** Número del negocio (remitente del echo). */
  from?: string;
  type?: string;
  text?: string;
  waMessageId?: string;
  timestamp?: number;
  /** Variante defensiva: entregar bajo la clave `messages` en vez de `message_echoes`. */
  useMessagesKey?: boolean;
  /** 074 — Campos crudos del eco (`edit`…), tal cual los mandaría Meta. */
  extra?: Record<string, unknown>;
} & MockMediaInput) {
  const type = input.type ?? "text";
  const message: Record<string, unknown> = {
    id: input.waMessageId ?? `wamid.mock.echo.${nextN()}`,
    timestamp: String(input.timestamp ?? Math.floor(Date.now() / 1000)),
    type,
    from: input.from ?? "5215500000000",
    to: input.to,
  };
  applyMockContent(message, type, input);
  if (input.extra) Object.assign(message, input.extra);

  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: input.wabaId,
        changes: [
          {
            field: "smb_message_echoes",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "5215500000000",
                phone_number_id: input.phoneNumberId,
              },
              ...(input.useMessagesKey
                ? { messages: [message] }
                : { message_echoes: [message] }),
            },
          },
        ],
      },
    ],
  };
}

export function buildStatusPayload(input: {
  wabaId: string;
  phoneNumberId: string;
  waMessageId: string;
  status: string;
  recipientId?: string;
  /** Meta adjunta `errors[]` en los `failed` (ej. 130472 del 2026-08-05). */
  errorCode?: number;
  errorMessage?: string;
}) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: input.wabaId,
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "5215500000000",
                phone_number_id: input.phoneNumberId,
              },
              statuses: [
                {
                  id: input.waMessageId,
                  status: input.status,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  recipient_id: input.recipientId ?? "5215511111111",
                  ...(input.errorCode != null
                    ? {
                        errors: [
                          {
                            code: input.errorCode,
                            title: input.errorMessage ?? "Error de envío",
                            message: input.errorMessage ?? "Error de envío",
                          },
                        ],
                      }
                    : {}),
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

export function buildTemplateStatusPayload(input: {
  wabaId: string;
  name: string;
  language: string;
  event: "APPROVED" | "REJECTED";
  reason?: string;
  templateId?: string;
}) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: input.wabaId,
        changes: [
          {
            field: "message_template_status_update",
            value: {
              event: input.event,
              message_template_id: input.templateId ?? `tplmock_${nextN()}`,
              message_template_name: input.name,
              message_template_language: input.language,
              reason: input.reason ?? null,
            },
          },
        ],
      },
    ],
  };
}
