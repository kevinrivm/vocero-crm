import { describe, expect, it } from "vitest";
import {
  despiertaLaParte,
  ipPublica,
  origenOf,
  payloadPublico,
  sourceUrlOf,
  splitInbound,
  TOPE_ADJUNTO_REMOTO,
  urlDeAdjuntoPermitida,
} from "@/server/inbox/remote-media";
import { lookupPublico } from "@/server/inbox/descarga-remota";
import { mediaRemota, serializeMessage, tipoDeEntrante } from "@/server/inbox/ingest";
import { debeAplicarse, extraerEdicion } from "@/server/inbox/ediciones";
import { armarEvento, mediaIdDelEvento } from "@/server/brains/contract";
import { normalizeMetaPagePayload, normalizeZernioEvent } from "@/server/messenger/ingest";
import { normalizeZernioTiktokEvent } from "@/server/tiktok/ingest";
import { esNoSoportado, previewText } from "@/components/inbox/helpers";
import type { WebhookMessage } from "@/server/inbox/webhook";

/**
 * 074 — Que no se pierda nada: la parte pura de los adjuntos de Instagram,
 * Messenger y TikTok, los mensajes que la bandeja no sabe dibujar y las
 * ediciones de WhatsApp.
 */

const CDN = "https://scontent.cdninstagram.com/v/foto";

describe("074 · splitInbound: un mensaje por texto y uno por adjunto", () => {
  it("texto y tres fotos de Meta: cuatro partes en orden; la primera conserva el id", () => {
    const partes = splitInbound(
      "mira estas",
      [1, 2, 3].map((i) => ({ type: "image", payload: { url: `${CDN}${i}.jpg` } })),
      "meta"
    );
    expect(partes.map((p) => [p.idSuffix, p.type])).toEqual([
      ["", "text"],
      ["#2", "image"],
      ["#3", "image"],
      ["#4", "image"],
    ]);
    expect(partes[1]?.media).toEqual({ kind: "image", sourceUrl: `${CDN}1.jpg`, origen: "meta" });
  });

  it("la forma de Zernio ({ type, url }) también se entiende", () => {
    const partes = splitInbound(
      null,
      [
        { type: "image", url: "https://cdn.zernio.example/a.jpg" },
        { type: "video", url: "https://cdn.zernio.example/b.mp4" },
        { type: "file", url: "https://cdn.zernio.example/c.pdf" },
      ],
      "zernio"
    );
    expect(partes.map((p) => [p.idSuffix, p.type, p.media?.origen])).toEqual([
      ["", "image", "zernio"],
      ["#2", "video", "zernio"],
      ["#3", "document", "zernio"],
    ]);
  });

  it("un sticker de Messenger (sticker_id) es sticker aunque diga image", () => {
    const [p] = splitInbound(null, [{ type: "image", payload: { url: `${CDN}.png`, sticker_id: 369239 } }], "meta");
    expect(p?.type).toBe("sticker");
    expect(p?.media?.kind).toBe("sticker");
  });

  it("una publicación compartida entra como texto con su línea y su enlace", () => {
    const [p] = splitInbound(
      null,
      [{ type: "share", payload: { url: "https://www.instagram.com/p/x/", title: "Promo" } }],
      "meta"
    );
    expect(p).toMatchObject({ type: "text", media: null });
    expect(p?.text).toBe("Compartió una publicación: Promo\nhttps://www.instagram.com/p/x/");
  });

  it("un tipo desconocido queda como «unsupported»; un tipo conocido sin URL, con su tipo", () => {
    const partes = splitInbound(null, [{ type: "carrusel_raro" }, { type: "audio" }], "meta");
    expect(partes.map((p) => [p.type, p.media])).toEqual([
      ["unsupported", null],
      ["audio", null],
    ]);
  });

  it("is_unsupported sin nada más: una parte «unsupported»; sin nada, ninguna", () => {
    expect(splitInbound(null, [], "meta", true).map((p) => p.type)).toEqual(["unsupported"]);
    expect(splitInbound(null, undefined, "meta")).toEqual([]);
    expect(splitInbound(null, "no es lista" as never, "meta")).toEqual([]);
  });
});

describe("074 · quién despierta al cerebro", () => {
  it("solo la última parte de un grupo", () => {
    const partes = [{ type: "text" }, { type: "image" }, { type: "image" }];
    expect(partes.map((_, i) => despiertaLaParte(partes, i))).toEqual([false, false, true]);
  });

  it("si nada del grupo se puede leer, nadie", () => {
    const partes = [{ type: "unsupported" }];
    expect(despiertaLaParte(partes, 0)).toBe(false);
    const mixto = [{ type: "unsupported" }, { type: "image" }];
    expect(despiertaLaParte(mixto, 1)).toBe(true);
  });
});

describe("074 · la URL de origen no sale a la bandeja", () => {
  it("payloadPublico quita sourceUrl y origen", () => {
    expect(payloadPublico({ sourceUrl: CDN, origen: "meta" })).toBeNull();
    expect(payloadPublico({ sourceUrl: CDN, otro: 1 })).toEqual({ otro: 1 });
    expect(payloadPublico({ latitude: 1, longitude: 2 })).toEqual({ latitude: 1, longitude: 2 });
    expect(payloadPublico([{ name: "x" }])).toEqual([{ name: "x" }]);
    expect(payloadPublico(null)).toBeNull();
  });

  it("sourceUrlOf y origenOf leen el payload; sin origen, el estricto (meta)", () => {
    expect(sourceUrlOf({ sourceUrl: CDN })).toBe(CDN);
    expect(sourceUrlOf({ sourceUrl: "" })).toBeNull();
    expect(sourceUrlOf(null)).toBeNull();
    expect(origenOf({ origen: "zernio" })).toBe("zernio");
    expect(origenOf({})).toBe("meta");
  });

  it("el DTO del mensaje no lleva la URL firmada", () => {
    const media = mediaRemota({ kind: "image", sourceUrl: CDN, origen: "meta" });
    expect(media).toMatchObject({ waMediaId: null, fetchStatus: "pending" });
    const dto = serializeMessage(
      {
        id: "msg_1",
        organizationId: "org_1",
        conversationId: "cv_1",
        waMessageId: "ig_mid#2",
        direction: "in",
        type: "image",
        text: null,
        status: "delivered",
        error: null,
        aiGenerated: false,
        origin: "operator",
        mediaAssetId: "ma_1",
        replyToWaMessageId: null,
        editedAt: null,
        originalText: null,
        waTimestamp: new Date("2026-11-24T10:00:00Z"),
        createdAt: new Date("2026-11-24T10:00:00Z"),
      },
      {
        id: "ma_1",
        organizationId: "org_1",
        kind: "image",
        waMediaId: null,
        mimeType: "image/jpeg",
        fileName: null,
        fileSize: 10,
        caption: null,
        payload: media.payload,
        storagePath: "org_1/ma_1",
        fetchStatus: "available",
        fetchError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never
    );
    expect(JSON.stringify(dto)).not.toContain("cdninstagram");
    expect(dto.editedAt).toBeNull();
    expect(dto.originalText).toBeNull();
  });
});

describe("074 · qué URL se puede bajar", () => {
  it("Meta directo: solo https a un host de Meta", () => {
    expect(urlDeAdjuntoPermitida(`${CDN}.jpg`, "meta")).toBe(true);
    expect(urlDeAdjuntoPermitida("https://lookaside.fbsbx.com/x", "meta")).toBe(true);
    expect(urlDeAdjuntoPermitida("https://example.com/x.jpg", "meta")).toBe(false);
    expect(urlDeAdjuntoPermitida("https://fbcdn.net.example.com/x", "meta")).toBe(false);
    expect(urlDeAdjuntoPermitida("http://scontent.fbcdn.net/x", "meta")).toBe(false);
    expect(urlDeAdjuntoPermitida("https://scontent.fbcdn.net:8443/x", "meta")).toBe(false);
    expect(urlDeAdjuntoPermitida("https://user:pw@scontent.fbcdn.net/x", "meta")).toBe(false);
  });

  it("Zernio: cualquier host público con nombre, nunca IP ni nombre interno", () => {
    expect(urlDeAdjuntoPermitida("https://cdn.zernio.example/a.jpg", "zernio")).toBe(true);
    expect(urlDeAdjuntoPermitida("https://p16-sign.tiktokcdn-us.com/a.jpg", "zernio")).toBe(true);
    for (const mala of [
      "https://10.0.0.5/a.jpg",
      "https://169.254.169.254/latest",
      "https://[::1]/a",
      "https://localhost/a",
      "https://intranet.local/a",
      "https://db.internal/a",
      "https://servidor/a",
      "http://cdn.zernio.example/a.jpg",
      "file:///etc/passwd",
      "no es url",
    ]) {
      expect(urlDeAdjuntoPermitida(mala, "zernio"), mala).toBe(false);
    }
  });

  it("el origen del simulador solo vale si se pasa (mocks encendidos)", () => {
    const mock = "http://localhost:3275";
    expect(urlDeAdjuntoPermitida(`${mock}/api/dev/x`, "meta", mock)).toBe(true);
    expect(urlDeAdjuntoPermitida(`${mock}/api/dev/x`, "meta")).toBe(false);
    expect(urlDeAdjuntoPermitida("http://127.0.0.1:3275/api/dev/x", "meta", mock)).toBe(false);
  });

  it("ipPublica distingue internet de la red interna", () => {
    for (const privada of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fc00::1", "fe80::1", "::ffff:10.0.0.1"]) {
      expect(ipPublica(privada), privada).toBe(false);
    }
    for (const publica of ["8.8.8.8", "157.240.1.1", "2a03:2880::1"]) {
      expect(ipPublica(publica), publica).toBe(true);
    }
    expect(ipPublica("no-es-ip")).toBe(false);
  });

  it("la resolución al conectar se niega a un nombre que cae en la red interna", async () => {
    const err = await new Promise<NodeJS.ErrnoException | null>((resolve) =>
      lookupPublico("localhost", {}, (e) => resolve(e))
    );
    expect(err?.code).toBe("EPRIVADA");
  });

  it("los topes: foto 10 MB, sticker 2 MB, lo demás 25 MB", () => {
    expect(TOPE_ADJUNTO_REMOTO.image).toBe(10 * 1024 * 1024);
    expect(TOPE_ADJUNTO_REMOTO.sticker).toBe(2 * 1024 * 1024);
    expect(TOPE_ADJUNTO_REMOTO.video).toBe(25 * 1024 * 1024);
  });
});

describe("074 · los tipos de WhatsApp ya no se descartan", () => {
  it("clasifica cada tipo", () => {
    expect(tipoDeEntrante("text")).toBe("normal");
    expect(tipoDeEntrante("interactive")).toBe("normal");
    expect(tipoDeEntrante("edit")).toBe("edicion");
    expect(tipoDeEntrante("reaction")).toBe("reaccion");
    for (const t of ["system", "request_welcome", "revoke", "ephemeral"]) {
      expect(tipoDeEntrante(t)).toBe("ignorar");
    }
    for (const t of ["unsupported", "unknown", "order", "poll"]) {
      expect(tipoDeEntrante(t)).toBe("sin_vista");
    }
  });
});

describe("074 · ediciones", () => {
  const base = { id: "wamid.nuevo", timestamp: "1795500000", type: "edit" } as WebhookMessage;

  it("lee el texto nuevo y el wamid editado", () => {
    expect(
      extraerEdicion({
        ...base,
        edit: { original_message_id: "wamid.orig", message: { type: "text", text: { body: "azul" } } },
      })
    ).toEqual({ originalId: "wamid.orig", texto: "azul", esPie: false, fecha: new Date(1795500000 * 1000) });
  });

  it("o el pie nuevo de una foto", () => {
    expect(
      extraerEdicion({
        ...base,
        edit: { original_message_id: "wamid.orig", message: { type: "image", image: { id: "1", caption: "esta" } } },
      })
    ).toMatchObject({ texto: "esta", esPie: true });
  });

  it("sin original o sin texto: null (se ignora sin tronar)", () => {
    expect(extraerEdicion({ ...base, edit: { message: { type: "text", text: { body: "x" } } } })).toBeNull();
    expect(extraerEdicion({ ...base, edit: { original_message_id: "w" } })).toBeNull();
    expect(extraerEdicion({ ...base, type: "text" })).toBeNull();
  });

  it("gana la más reciente; repetir la misma no cambia nada", () => {
    const t = new Date("2026-11-24T10:00:00Z");
    expect(debeAplicarse(null, t)).toBe(true);
    expect(debeAplicarse(t, new Date("2026-11-24T10:00:05Z"))).toBe(true);
    expect(debeAplicarse(t, t)).toBe(true);
    expect(debeAplicarse(t, new Date("2026-11-24T09:59:59Z"))).toBe(false);
  });
});

describe("074 · el despacho al cerebro", () => {
  it("WhatsApp sigue con el id de Graph; un adjunto copiado, con el id interno", () => {
    expect(mediaIdDelEvento({ waMediaId: "123", mimeType: null, caption: null, assetId: "ma_1" })).toBe("123");
    expect(
      mediaIdDelEvento({ waMediaId: null, mimeType: null, caption: null, assetId: "ma_1", payload: { sourceUrl: CDN } })
    ).toBe("ma_1");
    // Ubicación o tarjeta: sin nada que bajar.
    expect(
      mediaIdDelEvento({ waMediaId: null, mimeType: null, caption: null, assetId: "ma_2", payload: { latitude: 1 } })
    ).toBeNull();
    expect(mediaIdDelEvento(null)).toBeNull();
  });

  it("el evento de un adjunto de Instagram lleva su mediaId y su tipo", () => {
    const ev = armarEvento({
      dispatchId: "dsp_1",
      organization: { id: "org_1", slug: null },
      conversation: { id: "cv_1", channel: "instagram", aiEnabled: true, windowOpen: true, windowExpiresAt: null },
      contact: { id: "ct_1", displayName: "Ana", identity: "ig:1" },
      messages: [
        {
          id: "msg_1",
          createdAt: new Date("2026-11-24T10:00:00Z"),
          type: "image",
          text: null,
          media: { waMediaId: null, mimeType: "image/jpeg", caption: null, assetId: "ma_1", payload: { sourceUrl: CDN } },
        },
      ],
      firstMessageAt: new Date("2026-11-24T10:00:00Z"),
      lastMessageAt: new Date("2026-11-24T10:00:00Z"),
    });
    expect(ev.messages[0]).toEqual({
      id: "msg_1",
      at: "2026-11-24T10:00:00.000Z",
      type: "image",
      text: null,
      mediaId: "ma_1",
      mimeType: "image/jpeg",
      caption: null,
    });
    expect(JSON.stringify(ev)).not.toContain("cdninstagram");
  });
});

describe("074 · los normalizadores conservan TODOS los adjuntos", () => {
  it("Messenger por Meta", () => {
    const [evt] = normalizeMetaPagePayload({
      object: "page",
      entry: [
        {
          id: "page",
          messaging: [
            {
              sender: { id: "psid" },
              message: {
                mid: "m1",
                attachments: [
                  { type: "image", payload: { url: "https://scontent.fbcdn.net/1" } },
                  { type: "image", payload: { url: "https://scontent.fbcdn.net/2" } },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(evt?.attachments).toHaveLength(2);
  });

  it("Messenger por Zernio y TikTok", () => {
    const [fb] = normalizeZernioEvent({
      event: "message.received",
      message: { id: "z1", attachments: [{ type: "image", url: "https://x.example/1" }, { type: "video", url: "https://x.example/2" }], sender: { id: "s" } },
      account: { id: "acc", platform: "facebook" },
    });
    expect(fb?.attachments).toHaveLength(2);
    const [tt] = normalizeZernioTiktokEvent({
      event: "message.received",
      message: { id: "z2", platform: "tiktok", attachments: [{ type: "image", url: "https://x.example/1" }], sender: { id: "s" } },
      account: { id: "acc", platform: "tiktok" },
    });
    expect(tt?.attachments).toHaveLength(1);
  });
});

describe("074 · la bandeja", () => {
  it("esNoSoportado: sin texto, sin adjunto y de un tipo que no se dibuja", () => {
    expect(esNoSoportado({ type: "unsupported", text: null, media: null })).toBe(true);
    expect(esNoSoportado({ type: "poll", text: null, media: null })).toBe(true);
    expect(esNoSoportado({ type: "image", text: null, media: null })).toBe(false);
    expect(esNoSoportado({ type: "text", text: "hola", media: null })).toBe(false);
  });

  it("la vista previa de la lista marca lo que no se puede mostrar", () => {
    expect(previewText("unsupported")).toBe("⚠️ Mensaje no soportado");
    expect(previewText("poll")).toBe("⚠️ Encuesta");
    expect(previewText("image")).toBe("📎 Imagen");
  });
});
