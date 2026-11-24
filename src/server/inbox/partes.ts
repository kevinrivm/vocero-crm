import { ingestInboundMessage, mediaRemota } from "@/server/inbox/ingest";
import { despiertaLaParte, type InboundPart } from "@/server/inbox/remote-media";

type Base = Omit<
  Parameters<typeof ingestInboundMessage>[0],
  "waMessageId" | "type" | "text" | "media" | "despertar"
>;

/**
 * 074 — Mete a la bandeja las partes de un mensaje de Instagram, Messenger o
 * TikTok (`splitInbound`), en orden. La primera conserva el id de siempre y
 * las siguientes llevan `#2`, `#3`…: una reentrega no duplica nada. Solo la
 * última despierta al cerebro, que recibe el grupo entero en la ráfaga.
 *
 * Cada parte entra por el mismo núcleo de ingesta que cualquier mensaje:
 * contacto, conversación, idempotencia y bus de eventos.
 */
export async function ingerirPartes(
  base: Base,
  idBase: string,
  partes: readonly InboundPart[]
): Promise<void> {
  for (const [i, parte] of partes.entries()) {
    await ingestInboundMessage({
      ...base,
      waMessageId: `${idBase}${parte.idSuffix}`,
      type: parte.type,
      text: parte.text,
      media: parte.media ? mediaRemota(parte.media) : null,
      despertar: despiertaLaParte(partes, i),
    });
  }
}
