import { after } from "next/server";
import { getEnv } from "@/lib/env";
import { isValidSignature, isValidWebhookToken } from "@/server/inbox/webhook";
import {
  isValidZernioSignature,
  processMetaInstagramPayload,
  processZernioEvent,
  resolveZernioSecret,
} from "@/server/instagram/ingest";
import {
  channelDisabledResponse,
  isChannelEnabled,
} from "@/server/channels/enabled";
import { createLogger } from "@/lib/logger";

const log = createLogger("ig");

/**
 * 014 — Webhook público del canal de Instagram.
 *
 * Mismo patrón de dos capas que el de WhatsApp: el segmento [webhookToken]
 * debe coincidir (si no → 404 sin efectos), y encima la firma cuando la
 * fuente la provee. Acepta las dos fuentes por la misma URL porque sus
 * payloads son inconfundibles: Meta manda `object: "instagram"`, Zernio manda
 * un evento plano con `account`.
 */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ webhookToken: string }> };

export async function GET(req: Request, { params }: Params) {
  if (!isChannelEnabled("instagram")) return channelDisabledResponse();
  const { webhookToken } = await params;
  const env = getEnv();
  if (!isValidWebhookToken(webhookToken, env.META_WEBHOOK_VERIFY_TOKEN)) {
    return new Response(null, { status: 404 });
  }

  // Handshake de Meta (Zernio no lo hace, pero responderlo no estorba).
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === env.META_WEBHOOK_VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response(null, { status: 403 });
}

export async function POST(req: Request, { params }: Params) {
  if (!isChannelEnabled("instagram")) return channelDisabledResponse();
  const { webhookToken } = await params;
  const env = getEnv();
  if (!isValidWebhookToken(webhookToken, env.META_WEBHOOK_VERIFY_TOKEN)) {
    return new Response(null, { status: 404 });
  }

  const rawBody = await req.text();

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Cuerpo ilegible: 200 igualmente para que la fuente no reintente en vano.
    return Response.json({ received: true });
  }

  const isMeta =
    typeof payload === "object" &&
    payload !== null &&
    (payload as { object?: string }).object === "instagram";

  if (isMeta) {
    // Meta firma cada entrega con el App Secret, igual que en WhatsApp. Sin
    // esta capa, quien conozca la URL secreta puede inyectar DMs falsos: el
    // agente los contestaria enviando un DM REAL desde la cuenta del cliente
    // al destinatario que el atacante elija.
    if (!isValidSignature(rawBody, req.headers.get("x-hub-signature-256"), env.META_APP_SECRET)) {
      return new Response(null, { status: 401 });
    }
  } else {
    // Zernio: la firma se valida contra el secreto de ESTA cuenta, que hay que
    // resolver leyendo el cuerpo primero.
    const { secret } = await resolveZernioSecret(rawBody);
    const signature =
      req.headers.get("x-zernio-signature") ??
      req.headers.get("x-late-signature");
    if (!isValidZernioSignature(rawBody, signature, secret)) {
      return new Response(null, { status: 401 });
    }
  }

  // Zernio corta a los 5 segundos y reintenta: se acusa recibo YA y se procesa
  // fuera de la ruta.
  after(async () => {
    try {
      if (isMeta) {
        await processMetaInstagramPayload(payload);
      } else {
        await processZernioEvent(payload);
      }
    } catch (err) {
      log.error("error procesando payload", { err });
    }
  });

  return Response.json({ received: true });
}
