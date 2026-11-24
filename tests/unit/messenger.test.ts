import { describe, expect, it } from "vitest";
import { CHANNEL_LABEL, CHANNEL_ORDER, isChannel } from "@/lib/channels";
import { FB_PREFIX, IG_PREFIX, BSUID_PREFIX } from "@/server/inbox/identity";
import { capabilitiesFor, textFits, windowClosedMessage } from "@/server/channels/capabilities";
import { parseChannels } from "@/server/channels/enabled";
import { channelMark } from "@/components/channel-badge";
import {
  normalizeMetaPagePayload,
  normalizeZernioEvent,
} from "@/server/messenger/ingest";
import { buildMessengerSendBody } from "@/server/messenger/send";
import {
  isValidZernioSignature,
  looksLikeMetaPayload,
  zernioSentAtSeconds,
} from "@/server/zernio";
import { zernioTargetChannel } from "@/server/zernio/dispatch";
import { createHmac } from "node:crypto";

const PAGE = "1092837465";
const PSID = "83719264018";
const ACCOUNT = "665f1c2e8b3a4d0012345678";

/** Un webhook de Meta con lo que trae de verdad: `object: "page"`. */
function metaWebhook(messaging: unknown[], overrides: Record<string, unknown> = {}) {
  return {
    object: "page",
    entry: [{ id: PAGE, time: 1_770_000_000_000, messaging }],
    ...overrides,
  };
}

/** Un evento de Zernio, con la forma de su documentación. */
function zernioEvent(over: Record<string, unknown> = {}) {
  return {
    id: "5f8e2a1c-0000",
    event: "message.received",
    message: {
      id: "665f0001",
      conversationId: "664a0001",
      direction: "incoming",
      text: "Hola",
      sender: { id: PSID, name: "Jane Doe", username: "jane_doe" },
    },
    account: { id: ACCOUNT, platform: "facebook" },
    ...over,
  };
}

describe("017 · Messenger en el catálogo de canales", () => {
  it("existe, se enciende con CHANNELS y tiene nombre y distintivo", () => {
    expect(isChannel("messenger")).toBe(true);
    expect(CHANNEL_ORDER).toContain("messenger");
    expect(CHANNEL_LABEL.messenger).toBe("Messenger");
    expect(parseChannels("whatsapp,messenger").has("messenger")).toBe(true);
    expect(parseChannels("instagram").has("messenger")).toBe(false);
    expect(channelMark("messenger")).not.toBeNull();
  });

  it("capacidades: 24 h con etiqueta fuera de ventana, sin plantillas ni adjuntos salientes", () => {
    const caps = capabilitiesFor("messenger");
    expect(caps.windowMs).toBe(24 * 60 * 60 * 1000);
    expect(caps.outsideWindow).toBe("human_agent_tag");
    expect(caps.outboundMedia).toBe(false);
    expect(caps.deliveryReceipts).toBe(false);
    // Fuera de ventana no se le pide nada al operador: sale etiquetado solo.
    // 024: la extensión humana tiene tope (7 días) y su propio mensaje.
    expect(windowClosedMessage("messenger")).toContain("7 días");
  });

  it("el límite de texto es de 2000 y se cuenta en BYTES", () => {
    expect(textFits("messenger", "a".repeat(2000))).toBe(true);
    expect(textFits("messenger", "a".repeat(2001))).toBe(false);
    // 1200 acentos = 2400 bytes: contando caracteres pasaría y Meta lo rechazaría.
    expect(textFits("messenger", "é".repeat(1200))).toBe(false);
  });

  it("la identidad lleva su propio prefijo: nunca colisiona con WhatsApp ni Instagram", () => {
    expect(FB_PREFIX).toBe("fb:");
    expect(new Set([FB_PREFIX, IG_PREFIX, BSUID_PREFIX]).size).toBe(3);
  });
});

describe("017 · normalizeMetaPagePayload (qué entra y qué se descarta)", () => {
  it("un texto entra con su página, su PSID, su mid y su hora en segundos", () => {
    const [evt, ...rest] = normalizeMetaPagePayload(
      metaWebhook([
        {
          sender: { id: PSID },
          recipient: { id: PAGE },
          timestamp: 1_770_000_123_456,
          message: { mid: "m_abc", text: "Hola, ¿tienen envíos?" },
        },
      ])
    );
    expect(rest).toHaveLength(0);
    expect(evt).toEqual({
      routeKey: PAGE,
      psid: PSID,
      messageId: "m_abc",
      text: "Hola, ¿tienen envíos?",
      type: "text",
      timestamp: "1770000123",
      profileName: null,
      threadRef: null,
      attachments: [],
    });
  });

  it("un adjunto sin texto entra con su tipo para que la bandeja enseñe qué llegó", () => {
    const [img] = normalizeMetaPagePayload(
      metaWebhook([
        {
          sender: { id: PSID },
          message: {
            mid: "m_img",
            attachments: [{ type: "image", payload: { url: "https://cdn/x.jpg" } }],
          },
        },
      ])
    );
    expect(img?.type).toBe("image");
    expect(img?.text).toBeNull();

    const [doc] = normalizeMetaPagePayload(
      metaWebhook([{ sender: { id: PSID }, message: { mid: "m_doc", attachments: [{ type: "file" }] } }])
    );
    expect(doc?.type).toBe("document");

    const [sticker] = normalizeMetaPagePayload(
      metaWebhook([
        {
          sender: { id: PSID },
          message: { mid: "m_stk", attachments: [{ type: "image", payload: { sticker_id: 369239 } }] },
        },
      ])
    );
    expect(sticker?.type).toBe("sticker");
  });

  it("los echos (lo que mandó la página), los acuses y los postbacks NO son mensajes", () => {
    const events = normalizeMetaPagePayload(
      metaWebhook([
        { sender: { id: PAGE }, recipient: { id: PSID }, message: { mid: "m_echo", text: "Gracias", is_echo: true } },
        { sender: { id: PSID }, delivery: { mids: ["m_1"], watermark: 1 } },
        { sender: { id: PSID }, read: { watermark: 1 } },
        { sender: { id: PSID }, postback: { title: "Empezar", payload: "GET_STARTED" } },
      ])
    );
    expect(events).toEqual([]);
  });

  it("lo que no es un webhook de página se ignora entero", () => {
    expect(
      normalizeMetaPagePayload(metaWebhook([{ sender: { id: PSID }, message: { mid: "m", text: "x" } }], { object: "instagram" }))
    ).toEqual([]);
    expect(normalizeMetaPagePayload(null)).toEqual([]);
    expect(normalizeMetaPagePayload("basura")).toEqual([]);
    expect(normalizeMetaPagePayload({ object: "page" })).toEqual([]);
    // Un evento de Zernio NO debe colarse por el normalizador de Meta.
    expect(normalizeMetaPagePayload(zernioEvent())).toEqual([]);
  });

  it("sin remitente o sin mid no hay con qué identificar ni deduplicar: se descarta", () => {
    expect(
      normalizeMetaPagePayload(metaWebhook([{ message: { mid: "m", text: "x" } }, { sender: { id: PSID }, message: { text: "x" } }]))
    ).toEqual([]);
  });

  it("varias entradas y varios mensajes se aplanan en orden", () => {
    const events = normalizeMetaPagePayload({
      object: "page",
      entry: [
        { id: PAGE, messaging: [{ sender: { id: "a" }, message: { mid: "1", text: "uno" } }] },
        { id: "otra-pagina", messaging: [{ sender: { id: "b" }, message: { mid: "2", text: "dos" } }] },
      ],
    });
    expect(events.map((e) => `${e.routeKey}/${e.psid}/${e.messageId}`)).toEqual([`${PAGE}/a/1`, "otra-pagina/b/2"]);
  });
});

describe("017 · normalizeZernioEvent (la fuente unificada)", () => {
  it("un mensaje de Facebook entra con su cuenta, su PSID, su hilo y el nombre del perfil", () => {
    const [evt] = normalizeZernioEvent(zernioEvent());
    expect(evt?.routeKey).toBe(ACCOUNT);
    expect(evt?.psid).toBe(PSID);
    expect(evt?.messageId).toBe("665f0001");
    expect(evt?.text).toBe("Hola");
    expect(evt?.type).toBe("text");
    // El conversationId es lo ÚNICO con lo que se puede responder por Zernio.
    expect(evt?.threadRef).toBe("664a0001");
    expect(evt?.profileName).toBe("Jane Doe");
  });

  it("sin nombre cae al usuario con arroba, que sigue siendo legible", () => {
    const [evt] = normalizeZernioEvent(
      zernioEvent({
        message: {
          id: "m1",
          conversationId: "c1",
          direction: "incoming",
          text: "hola",
          sender: { id: PSID, username: "jane_doe" },
        },
      })
    );
    expect(evt?.profileName).toBe("@jane_doe");
  });

  it("el MISMO webhook trae otras plataformas: solo se ingiere Facebook/Messenger", () => {
    for (const platform of ["instagram", "whatsapp", "x", "tiktok", ""]) {
      expect(
        normalizeZernioEvent(zernioEvent({ account: { id: ACCOUNT, platform } }))
      ).toEqual([]);
    }
    expect(
      normalizeZernioEvent(zernioEvent({ account: { id: ACCOUNT, platform: "MESSENGER" } }))
    ).toHaveLength(1);
  });

  it("solo `message.received` entrante: lo demás es ruido de la bandeja de Zernio", () => {
    expect(normalizeZernioEvent(zernioEvent({ event: "message.sent" }))).toEqual([]);
    expect(normalizeZernioEvent(zernioEvent({ event: "message.read" }))).toEqual([]);
    expect(
      normalizeZernioEvent(
        zernioEvent({
          message: { id: "m", conversationId: "c", direction: "outgoing", text: "x", sender: { id: PSID } },
        })
      )
    ).toEqual([]);
  });

  it("sin cuenta, sin remitente o sin id de mensaje no se puede enrutar ni deduplicar", () => {
    expect(normalizeZernioEvent(zernioEvent({ account: { platform: "facebook" } }))).toEqual([]);
    expect(
      normalizeZernioEvent(zernioEvent({ message: { id: "m", direction: "incoming", text: "x" } }))
    ).toEqual([]);
    expect(normalizeZernioEvent(null)).toEqual([]);
    expect(normalizeZernioEvent({ object: "page" })).toEqual([]);
  });

  it("un adjunto de Zernio también entra con su tipo", () => {
    const [evt] = normalizeZernioEvent(
      zernioEvent({
        message: {
          id: "m_img",
          conversationId: "c1",
          direction: "incoming",
          text: null,
          attachments: [{ type: "image", url: "https://cdn/x.jpg" }],
          sender: { id: PSID },
        },
      })
    );
    expect(evt?.type).toBe("image");
    expect(evt?.text).toBeNull();
  });
});

describe("017 · firma de Zernio (control de seguridad compartido)", () => {
  const body = JSON.stringify(zernioEvent());
  const secret = "s3cr3t0";
  const good = createHmac("sha256", secret).update(body).digest("hex");

  it("acepta la firma correcta y rechaza la que no lo es", () => {
    expect(isValidZernioSignature(body, good, secret)).toBe(true);
    expect(isValidZernioSignature(body, good.toUpperCase(), secret)).toBe(true);
    expect(isValidZernioSignature(body, "deadbeef", secret)).toBe(false);
    expect(isValidZernioSignature(body + " ", good, secret)).toBe(false);
    expect(isValidZernioSignature(body, null, secret)).toBe(false);
  });

  it("sin secreto configurado la capa queda desactivada, como en WhatsApp", () => {
    expect(isValidZernioSignature(body, null, null)).toBe(true);
  });

  it("distingue un payload de Meta de uno de Zernio", () => {
    expect(looksLikeMetaPayload({ object: "page" }, "page")).toBe(true);
    expect(looksLikeMetaPayload({ object: "instagram" }, "page")).toBe(false);
    expect(looksLikeMetaPayload(zernioEvent(), "page")).toBe(false);
    expect(looksLikeMetaPayload(null, "page")).toBe(false);
  });
});

describe("017 · la hora del mensaje sale del evento, no de la ingesta", () => {
  it("usa `sentAt` cuando viene", () => {
    // Importa porque `lastInboundAt` abre la ventana de 24 h: una reentrega
    // tardía sellada con la hora de llegada haría creer que la ventana está
    // abierta cuando la plataforma ya la cerró.
    expect(zernioSentAtSeconds("2026-09-02T00:56:04.336Z")).toBe("1788310564");
  });

  it("un `sentAt` ausente o ilegible cae a la hora actual, nunca a NaN", () => {
    const ahora = Math.floor(Date.now() / 1000);
    for (const v of [undefined, "", "ayer por la tarde"]) {
      const s = Number(zernioSentAtSeconds(v));
      expect(Number.isFinite(s)).toBe(true);
      expect(Math.abs(s - ahora)).toBeLessThan(5);
    }
  });

  it("el normalizador lo propaga", () => {
    const [evt] = normalizeZernioEvent(
      zernioEvent({
        message: {
          id: "m1",
          conversationId: "c1",
          direction: "incoming",
          text: "hola",
          sentAt: "2026-09-02T00:56:04.336Z",
          sender: { id: PSID, name: "Jane" },
        },
      })
    );
    expect(evt?.timestamp).toBe("1788310564");
  });
});

describe("017 · reparto de Zernio por plataforma (un webhook, varios canales)", () => {
  it("manda cada plataforma a su canal", () => {
    // Zernio entrega TODAS las cuentas de la llave por un solo webhook: si
    // cada canal atendiera solo su URL, quien tenga el webhook apuntado a
    // Instagram vería sus mensajes de Messenger descartados en silencio.
    expect(zernioTargetChannel(zernioEvent({ account: { id: ACCOUNT, platform: "instagram" } }))).toBe("instagram");
    expect(zernioTargetChannel(zernioEvent({ account: { id: ACCOUNT, platform: "facebook" } }))).toBe("messenger");
    expect(zernioTargetChannel(zernioEvent({ account: { id: ACCOUNT, platform: "MESSENGER" } }))).toBe("messenger");
  });

  it("una plataforma que Vocero no atiende no es de nadie", () => {
    // 022: `tiktok` salió de esta lista: ya es un canal (tests/unit/tiktok.test.ts).
    for (const platform of ["whatsapp", "x", "twitter", "linkedin", ""]) {
      expect(zernioTargetChannel(zernioEvent({ account: { id: ACCOUNT, platform } }))).toBeNull();
    }
    expect(zernioTargetChannel(null)).toBeNull();
    expect(zernioTargetChannel({ object: "page" })).toBeNull();
  });
});

describe("017 · buildMessengerSendBody (transporte de Meta)", () => {
  it("dentro de la ventana es una RESPONSE normal", () => {
    expect(buildMessengerSendBody({ recipient: PSID, text: "Sí, a toda la ciudad", humanAgentTag: false })).toEqual({
      recipient: { id: PSID },
      message: { text: "Sí, a toda la ciudad" },
      messaging_type: "RESPONSE",
    });
  });

  it("fuera de la ventana sale etiquetado como agente humano", () => {
    const body = buildMessengerSendBody({ recipient: PSID, text: "Ya te contesto", humanAgentTag: true });
    expect(body.messaging_type).toBe("MESSAGE_TAG");
    expect(body.tag).toBe("HUMAN_AGENT");
  });
});
