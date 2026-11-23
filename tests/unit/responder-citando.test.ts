import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 039 — Responder citando un mensaje: lo que entra con `context.id` se guarda
 * como cita, y lo que sale como respuesta lleva `context.message_id` a Graph.
 */

const h = vi.hoisted(() => ({
  graphRequest: vi.fn(),
  uploadGraphMedia: vi.fn(),
  saveMediaFile: vi.fn(),
  publish: vi.fn(),
  getCredentialsByOrg: vi.fn(),
  /** Filas que devolverá cada `select`, en orden. */
  selectRows: [] as unknown[][],
  /** Cada INSERT: la tabla y los valores. */
  inserts: [] as { table: unknown; values: Record<string, unknown> }[],
}));

vi.mock("@/lib/meta/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/meta/client")>();
  return { ...original, graphRequest: h.graphRequest };
});

vi.mock("@/server/whatsapp/media", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/whatsapp/media")>();
  return {
    ...original,
    uploadGraphMedia: h.uploadGraphMedia,
    saveMediaFile: h.saveMediaFile,
    ensureAssetAvailable: vi.fn(async () => {}),
  };
});

vi.mock("@/server/events/bus", () => ({ publish: h.publish }));

vi.mock("@/server/whatsapp/credentials", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/server/whatsapp/credentials")>();
  return {
    ...original,
    getCredentialsByOrg: h.getCredentialsByOrg,
    getCredentialsByPhoneNumberId: vi.fn(async () => ({
      organizationId: "org_1",
    })),
  };
});

vi.mock("@/server/inbox/identity", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/inbox/identity")>();
  return {
    ...original,
    getOrCreateContactByIdentity: vi.fn(async () => ({
      contact: { id: "ct_1", channel: "whatsapp" },
    })),
  };
});

vi.mock("@/server/inbox/lead-activity", () => ({
  onLeadActivity: vi.fn(async () => {}),
}));
vi.mock("@/server/brains/config", () => ({ despachoActivo: () => false }));
vi.mock("@/server/dispatch/encolar", () => ({
  despacharAlCerebro: vi.fn(async () => {}),
}));

/**
 * Cadena de Drizzle simulada: todo método devuelve la cadena y al final se
 * resuelve (con `await` o con `.limit()`) a las filas encoladas.
 */
function chain(result: () => unknown[]) {
  const c: Record<string, unknown> = {};
  for (const m of [
    "from",
    "innerJoin",
    "leftJoin",
    "where",
    "orderBy",
    "set",
    "onConflictDoNothing",
  ]) {
    c[m] = () => c;
  }
  c.limit = () => Promise.resolve(result());
  c.returning = () => Promise.resolve(result());
  c.then = (ok: (v: unknown[]) => unknown, ko?: (e: unknown) => unknown) =>
    Promise.resolve(result()).then(ok, ko);
  return c;
}

vi.mock("@/lib/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db")>();
  let seq = 0;
  return {
    ...original,
    getDb: () => ({
      select: () => {
        const rows = h.selectRows.shift() ?? [];
        return chain(() => rows);
      },
      insert: (table: unknown) => {
        let values: Record<string, unknown> = {};
        const c = chain(() => [
          {
            createdAt: new Date("2026-10-21T12:00:00Z"),
            waTimestamp: null,
            error: null,
            aiGenerated: false,
            origin: "operator",
            mediaAssetId: null,
            replyToWaMessageId: null,
            ...values,
            id: values.id ?? `row_${++seq}`,
          },
        ]);
        c.values = (v: Record<string, unknown>) => {
          values = v;
          h.inserts.push({ table, values: v });
          return c;
        };
        return c;
      },
      update: () => chain(() => []),
    }),
  };
});

import { schema } from "@/lib/db";
import {
  aCitaDto,
  citaDelWebhook,
  conCita,
} from "@/server/inbox/quotes";

const insertsDeMensajes = () =>
  h.inserts.filter((i) => i.table === schema.message).map((i) => i.values);

beforeEach(() => {
  h.graphRequest.mockReset();
  h.uploadGraphMedia.mockReset();
  h.saveMediaFile.mockReset();
  h.publish.mockReset();
  h.getCredentialsByOrg.mockReset();
  h.selectRows.length = 0;
  h.inserts.length = 0;
});

describe("citaDelWebhook", () => {
  it("toma context.id", () => {
    expect(citaDelWebhook({ context: { from: "521", id: "wamid.A" } })).toBe(
      "wamid.A"
    );
  });

  it("sin context, sin id o vacío → null (reenviados y productos no son citas)", () => {
    expect(citaDelWebhook({})).toBeNull();
    expect(citaDelWebhook({ context: { from: "521" } })).toBeNull();
    expect(citaDelWebhook({ context: { id: "  " } })).toBeNull();
    expect(
      citaDelWebhook({ context: { id: 42 as unknown as string } })
    ).toBeNull();
  });
});

describe("conCita", () => {
  it("agrega context.message_id solo si hay a qué responder", () => {
    const base = { messaging_product: "whatsapp", type: "text" };
    expect(conCita(base, "wamid.A")).toEqual({
      ...base,
      context: { message_id: "wamid.A" },
    });
    expect(conCita(base, null)).toEqual(base);
    expect(conCita(base, undefined)).not.toHaveProperty("context");
  });
});

describe("aCitaDto", () => {
  it("original ausente → id null", () => {
    expect(aCitaDto(null)).toEqual({
      id: null,
      direction: null,
      type: null,
      text: null,
      mediaKind: null,
    });
  });

  it("recorta el texto largo y usa el pie de un adjunto", () => {
    const largo = "a".repeat(300);
    const dto = aCitaDto({
      message: { id: "msg_1", direction: "in", type: "text", text: largo } as never,
      media: null,
    });
    expect(dto.text).toHaveLength(201);
    expect(dto.text?.endsWith("…")).toBe(true);

    const foto = aCitaDto({
      message: { id: "msg_2", direction: "out", type: "image", text: null } as never,
      media: { kind: "image", caption: "taladro azul" } as never,
    });
    expect(foto).toMatchObject({ id: "msg_2", text: "taladro azul", mediaKind: "image" });
  });
});

/* ---------------- Ingesta ---------------- */

function webhookValue(msg: Record<string, unknown>) {
  return {
    metadata: { phone_number_id: "pn_1" },
    contacts: [{ wa_id: "5215550001234", profile: { name: "Cliente" } }],
    messages: [
      {
        from: "5215550001234",
        id: "wamid.IN",
        timestamp: "1792600000",
        type: "text",
        text: { body: "¿y este en azul?" },
        ...msg,
      },
    ],
  };
}

describe("ingesta de WhatsApp con context", () => {
  it("guarda el wamid citado en reply_to_wa_message_id y lo publica resuelto", async () => {
    // select de resolverCita: el original existe en el CRM.
    h.selectRows.push([
      {
        message: {
          id: "msg_orig",
          direction: "out",
          type: "image",
          text: null,
          waMessageId: "wamid.FOTO",
        },
        media: { kind: "image", caption: "Martillo de uña" },
      },
    ]);
    const { processMessagesValue } = await import("@/server/inbox/ingest");
    await processMessagesValue(
      webhookValue({ context: { from: "521", id: "wamid.FOTO" } }) as never
    );

    const [entrante] = insertsDeMensajes();
    expect(entrante).toMatchObject({
      waMessageId: "wamid.IN",
      direction: "in",
      replyToWaMessageId: "wamid.FOTO",
    });

    const nuevo = h.publish.mock.calls.find(
      ([, e]) => (e as { type: string }).type === "message.new"
    )?.[1] as { data: { message: { replyTo: unknown } } };
    expect(nuevo.data.message.replyTo).toEqual({
      id: "msg_orig",
      direction: "out",
      type: "image",
      text: "Martillo de uña",
      mediaKind: "image",
    });
  });

  it("sin context → reply_to_wa_message_id null y replyTo null", async () => {
    const { processMessagesValue } = await import("@/server/inbox/ingest");
    await processMessagesValue(webhookValue({}) as never);

    const [entrante] = insertsDeMensajes();
    expect(entrante?.replyToWaMessageId).toBeNull();
    const nuevo = h.publish.mock.calls.find(
      ([, e]) => (e as { type: string }).type === "message.new"
    )?.[1] as { data: { message: { replyTo: unknown } } };
    expect(nuevo.data.message.replyTo).toBeNull();
  });

  it("cita a un mensaje que no está en el CRM → se guarda y se enseña como no disponible", async () => {
    h.selectRows.push([]);
    const { processMessagesValue } = await import("@/server/inbox/ingest");
    await processMessagesValue(
      webhookValue({ context: { id: "wamid.VIEJO" } }) as never
    );
    expect(insertsDeMensajes()[0]?.replyToWaMessageId).toBe("wamid.VIEJO");
    const nuevo = h.publish.mock.calls.find(
      ([, e]) => (e as { type: string }).type === "message.new"
    )?.[1] as { data: { message: { replyTo: { id: unknown } } } };
    expect(nuevo.data.message.replyTo.id).toBeNull();
  });

  it("un eco de coexistence citado también guarda la cita", async () => {
    h.selectRows.push([]); // resolverCita: el citado no está en el CRM
    const { processEchoesValue } = await import("@/server/inbox/ingest");
    await processEchoesValue({
      metadata: { phone_number_id: "pn_1" },
      message_echoes: [
        {
          to: "5215550001234",
          id: "wamid.ECO",
          timestamp: "1792600000",
          type: "text",
          text: { body: "sí, en azul" },
          context: { id: "wamid.IN" },
        },
      ],
    } as never);
    expect(insertsDeMensajes()[0]).toMatchObject({
      waMessageId: "wamid.ECO",
      origin: "manual",
      replyToWaMessageId: "wamid.IN",
    });
  });
});

/* ---------------- Envío ---------------- */

const CONVERSACION_WA = {
  conversation: {
    id: "cv_1",
    organizationId: "org_1",
    isTest: false,
    channel: "whatsapp",
    lastInboundAt: new Date(),
    channelThreadRef: null,
  },
  contact: { id: "ct_1", phone: "5215550001234", waUserId: null, waIdentity: "5215550001234" },
};

const CITADO = {
  message: {
    id: "msg_in",
    conversationId: "cv_1",
    direction: "in",
    type: "text",
    text: "¿y este en azul?",
    waMessageId: "wamid.IN",
  },
  media: null,
};

function conectado() {
  h.getCredentialsByOrg.mockResolvedValue({
    organizationId: "org_1",
    phoneNumberId: "pn_1",
    token: "tok",
    status: "connected",
  });
  h.graphRequest.mockResolvedValue({ messages: [{ id: "wamid.OUT" }] });
}

describe("envío con context", () => {
  it("sendText citando → Graph recibe context.message_id y el saliente guarda la cita", async () => {
    conectado();
    h.selectRows.push([CONVERSACION_WA], [CITADO]);
    const { sendText } = await import("@/server/inbox/send");

    await sendText({
      conversationId: "cv_1",
      organizationId: "org_1",
      text: "Sí, lo tenemos",
      replyToMessageId: "msg_in",
    });

    const [, init] = h.graphRequest.mock.calls[0]!;
    expect(init.body).toMatchObject({
      type: "text",
      text: { body: "Sí, lo tenemos" },
      context: { message_id: "wamid.IN" },
    });
    expect(insertsDeMensajes()[0]).toMatchObject({
      waMessageId: "wamid.OUT",
      replyToWaMessageId: "wamid.IN",
    });
    const nuevo = h.publish.mock.calls[0]![1] as {
      data: { message: { replyTo: { id: string } } };
    };
    expect(nuevo.data.message.replyTo.id).toBe("msg_in");
  });

  it("068: Meta rechaza la cita con 131009 → se reintenta una vez sin cita y el hilo la guarda sin cita", async () => {
    conectado();
    const { MetaApiError } = await import("@/lib/meta/client");
    h.graphRequest
      .mockRejectedValueOnce(
        new MetaApiError("(#131009) Parameter value is not valid", { status: 400, code: 131009 })
      )
      .mockResolvedValueOnce({ messages: [{ id: "wamid.OUT2" }] });
    h.selectRows.push([CONVERSACION_WA], [CITADO]);
    const { sendText } = await import("@/server/inbox/send");

    const r = await sendText({
      conversationId: "cv_1",
      organizationId: "org_1",
      text: "Sí, lo tenemos",
      replyToMessageId: "msg_in",
    });

    expect(h.graphRequest).toHaveBeenCalledTimes(2);
    expect(h.graphRequest.mock.calls[0]![1].body).toHaveProperty("context");
    const reintento = h.graphRequest.mock.calls[1]![1].body;
    expect(reintento).not.toHaveProperty("context");
    expect(reintento).toMatchObject({ type: "text", text: { body: "Sí, lo tenemos" } });
    expect(r.messageId).toBeTruthy();
    expect(insertsDeMensajes()[0]).toMatchObject({
      waMessageId: "wamid.OUT2",
      replyToWaMessageId: null,
    });
  });

  it("068: un 131009 sin cita no se reintenta (no hay nada que quitar)", async () => {
    conectado();
    const { MetaApiError } = await import("@/lib/meta/client");
    h.graphRequest.mockReset();
    h.graphRequest.mockRejectedValue(
      new MetaApiError("(#131009) Parameter value is not valid", { status: 400, code: 131009 })
    );
    h.selectRows.push([CONVERSACION_WA]);
    const { sendText, SendError } = await import("@/server/inbox/send");

    const err = await sendText({ conversationId: "cv_1", organizationId: "org_1", text: "hola" }).catch(
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(SendError);
    expect((err as InstanceType<typeof SendError>).metaCode).toBe(131009);
    expect(h.graphRequest).toHaveBeenCalledTimes(1);
  });

  it("068: otro rechazo de Meta con cita no se reintenta", async () => {
    conectado();
    const { MetaApiError } = await import("@/lib/meta/client");
    h.graphRequest.mockReset();
    h.graphRequest.mockRejectedValue(
      new MetaApiError("(#131047) Re-engagement message", { status: 400, code: 131047 })
    );
    h.selectRows.push([CONVERSACION_WA], [CITADO]);
    const { sendText } = await import("@/server/inbox/send");

    await expect(
      sendText({ conversationId: "cv_1", organizationId: "org_1", text: "hola", replyToMessageId: "msg_in" })
    ).rejects.toMatchObject({ code: "meta_error", metaCode: 131047 });
    expect(h.graphRequest).toHaveBeenCalledTimes(1);
  });

  it("sendText sin cita → sin context en el payload", async () => {
    conectado();
    h.selectRows.push([CONVERSACION_WA]);
    const { sendText } = await import("@/server/inbox/send");

    await sendText({ conversationId: "cv_1", organizationId: "org_1", text: "hola" });

    const [, init] = h.graphRequest.mock.calls[0]!;
    expect(init.body).not.toHaveProperty("context");
    expect(insertsDeMensajes()[0]?.replyToWaMessageId).toBeNull();
  });

  it("adjunto citando → context en el payload del adjunto", async () => {
    conectado();
    h.saveMediaFile.mockResolvedValue("org_1/asset.jpg");
    h.uploadGraphMedia.mockResolvedValue("media_1");
    h.selectRows.push([CONVERSACION_WA], [CITADO]);
    const { sendMediaMessage } = await import("@/server/inbox/send");

    await sendMediaMessage({
      conversationId: "cv_1",
      organizationId: "org_1",
      file: { data: Buffer.from("x"), mimeType: "image/jpeg" },
      replyToMessageId: "msg_in",
    });

    const [, init] = h.graphRequest.mock.calls[0]!;
    expect(init.body).toMatchObject({
      type: "image",
      image: { id: "media_1" },
      context: { message_id: "wamid.IN" },
    });
  });

  it("ubicación citando → context en el payload", async () => {
    conectado();
    h.selectRows.push([CONVERSACION_WA], [CITADO]);
    const { sendStructured } = await import("@/server/inbox/send");

    await sendStructured({
      conversationId: "cv_1",
      organizationId: "org_1",
      kind: "location",
      location: { latitude: 20.67, longitude: -103.35 },
      replyToMessageId: "msg_in",
    });

    const [, init] = h.graphRequest.mock.calls[0]!;
    expect(init.body).toMatchObject({
      type: "location",
      context: { message_id: "wamid.IN" },
    });
  });

  it("citar un mensaje de otra conversación → reply_unavailable sin llamar a Graph", async () => {
    conectado();
    h.selectRows.push([CONVERSACION_WA], []);
    const { sendText } = await import("@/server/inbox/send");

    await expect(
      sendText({
        conversationId: "cv_1",
        organizationId: "org_1",
        text: "hola",
        replyToMessageId: "msg_ajeno",
      })
    ).rejects.toMatchObject({ code: "reply_unavailable" });
    expect(h.graphRequest).not.toHaveBeenCalled();
  });

  it("citar un mensaje sin wamid (falló o es de pruebas) → reply_unavailable", async () => {
    conectado();
    h.selectRows.push(
      [CONVERSACION_WA],
      [{ ...CITADO, message: { ...CITADO.message, waMessageId: null } }]
    );
    const { sendText } = await import("@/server/inbox/send");

    await expect(
      sendText({
        conversationId: "cv_1",
        organizationId: "org_1",
        text: "hola",
        replyToMessageId: "msg_in",
      })
    ).rejects.toMatchObject({ code: "reply_unavailable" });
    expect(h.graphRequest).not.toHaveBeenCalled();
  });

  it("solo WhatsApp declara quoteReplies (la UI y el envío lo consultan)", async () => {
    const { capabilitiesFor } = await import("@/server/channels/capabilities");
    expect(capabilitiesFor("whatsapp").quoteReplies).toBe(true);
    for (const canal of ["instagram", "messenger", "tiktok"] as const) {
      expect(capabilitiesFor(canal).quoteReplies, canal).toBe(false);
    }
  });
});

/* ---------------- Instagram: no cita (spec 039 · D5) ---------------- */

const ig = vi.hoisted(() => ({ sendInstagramText: vi.fn() }));
vi.mock("@/server/instagram/send", () => ({
  sendInstagramText: ig.sendInstagramText,
}));
vi.mock("@/server/channels/enabled", () => ({ isChannelEnabled: () => true }));
vi.mock("@/server/instagram/credentials", () => ({
  getInstagramCredentialsByOrg: vi.fn(async () => ({
    organizationId: "org_1",
    status: "connected",
    source: "zernio",
  })),
  markInstagramReconnectRequired: vi.fn(),
}));

describe("envío citando en Instagram", () => {
  it("→ reply_unavailable y no se envía sin la cita en silencio", async () => {
    ig.sendInstagramText.mockReset();
    h.selectRows.push([
      {
        conversation: { ...CONVERSACION_WA.conversation, channel: "instagram" },
        contact: { ...CONVERSACION_WA.contact, waIdentity: "ig:123" },
      },
    ]);
    const { sendText } = await import("@/server/inbox/send");

    await expect(
      sendText({
        conversationId: "cv_1",
        organizationId: "org_1",
        text: "hola",
        replyToMessageId: "msg_in",
      })
    ).rejects.toMatchObject({ code: "reply_unavailable" });
    expect(ig.sendInstagramText).not.toHaveBeenCalled();
  });
});
