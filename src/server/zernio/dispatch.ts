import { isChannelEnabled } from "@/server/channels/enabled";
import { processZernioEvent } from "@/server/instagram/ingest";
import { processZernioMessengerEvent } from "@/server/messenger/ingest";
import { processZernioTiktokEvent, zernioPlatform } from "@/server/tiktok/ingest";
import { webhookVerifyToken } from "@/server/whatsapp/webhook-url";
import {
  isValidZernioSignatureAny,
  parseZernioEvent,
  type ZernioEvent,
} from "@/server/zernio";
import {
  findZernioConnection,
  healZernioAccountRef,
  storedZernioSecrets,
} from "@/server/zernio/conexiones";
import type { ZernioChannel } from "@/server/zernio/cuentas";
import { registrarReaccionZernio } from "@/server/inbox/reacciones";
import {
  ZERNIO_REACTION_EVENT,
  WEBHOOKS_RECHECK_MS,
  webhookSecretsFromZernio,
} from "@/server/zernio/webhooks";

/**
 * 017 — Reparto de un evento de Zernio al canal que le toca.
 *
 * Zernio entrega TODAS las plataformas conectadas a esa llave por UN solo
 * webhook: el que se dé de alta recibe los DMs de Instagram y los mensajes de
 * la página de Facebook por igual. Si cada canal solo atendiera su propia URL,
 * quien tenga el webhook apuntado a `/api/webhooks/ig/...` vería sus mensajes
 * de Messenger descartados en silencio — el peor modo de fallo posible, porque
 * el webhook responde 200 y no hay nada que investigar.
 *
 * Así que todas las rutas de Zernio reparten por `account.platform`, y da
 * igual cuál de las URLs esté configurada. 022: TikTok entra al mismo reparto.
 */

/** A qué canal pertenece un evento, o null si no es de ninguno nuestro. */
export function zernioTargetChannel(payload: unknown): ZernioChannel | null {
  const evt = payload as ZernioEvent | null;
  if (!evt || typeof evt !== "object") return null;
  const platform = zernioPlatform(evt);
  if (platform === "instagram") return "instagram";
  if (platform === "facebook" || platform === "messenger") return "messenger";
  if (platform === "tiktok") return "tiktok";
  return null;
}

/**
 * 023 — ¿Esta entrega la firmó Zernio para esta instancia?
 *
 * El secreto es del WEBHOOK, no del canal: un webhook de Zernio sirve a todas
 * las cuentas de su llave y firma con uno solo. Por eso vale cualquiera de los
 * secretos guardados en los canales por Zernio de la organización, y si
 * ninguno coincide (o no hay), los de los webhooks de Zernio que apuntan aquí,
 * leídos con la llave ya guardada. Así un secreto mal capturado deja de tumbar
 * un canal, y uno que nunca se capturó se exige igual. Esa lectura se guarda
 * unos minutos; si la firma no coincide con lo guardado se relee, como mucho
 * una vez por minuto, por si el secreto cambió en Zernio.
 *
 * Se resuelve ANTES de procesar y sin escribir nada. Un evento sin cuenta, o
 * de una cuenta que nadie conectó aquí, no tiene contra qué compararse y pasa:
 * `processZernioPayload` lo descarta sin ingerir nada. Sin ningún secreto en
 * ningún lado la capa queda apagada, como siempre, y protege el segmento
 * secreto de la URL.
 */
export async function isAuthenticZernioDelivery(
  rawBody: string,
  signature: string | null
): Promise<boolean> {
  const evt = parseZernioEvent(rawBody);
  const channel = zernioTargetChannel(evt);
  if (!evt || !channel) return true;
  const found = await findZernioConnection(channel, evt.account);
  if (!found) return true;

  const stored = await storedZernioSecrets(found.connection.organizationId);
  if (stored.length > 0 && isValidZernioSignatureAny(rawBody, signature, stored)) {
    return true;
  }
  const { token } = found.connection;
  const segment = webhookVerifyToken();
  const remote = await webhookSecretsFromZernio(token, segment);
  if (remote.length > 0 && isValidZernioSignatureAny(rawBody, signature, remote)) {
    return true;
  }
  const fresh = await webhookSecretsFromZernio(token, segment, WEBHOOKS_RECHECK_MS);
  if (stored.length === 0 && fresh.length === 0) return true;
  return fresh.length > 0 && isValidZernioSignatureAny(rawBody, signature, fresh);
}

/**
 * Procesa el evento por el canal al que pertenece. Un canal apagado descarta
 * con aviso: la instancia no lo tiene, y su superficie no existe (ADR-001).
 */
export async function processZernioPayload(payload: unknown): Promise<void> {
  const channel = zernioTargetChannel(payload);
  if (!channel) return; // otra plataforma conectada a la misma llave: no es nuestra

  if (!isChannelEnabled(channel)) {
    console.warn(
      `[zernio] evento de ${channel} con el canal apagado en esta instancia: descartado`
    );
    return;
  }

  // 023: una conexión guardada con el id del perfil se corrige aquí, ya con
  // la firma verificada, y el canal la encuentra por el id de la cuenta.
  await healZernioAccountRef(channel, (payload as ZernioEvent).account);

  // 072: una reacción del cliente se pega al mensaje, no es uno nuevo. TikTok
  // no reacciona aquí (D4): se descarta.
  if ((payload as ZernioEvent).event === ZERNIO_REACTION_EVENT) {
    if (channel === "instagram" || channel === "messenger") {
      await registrarReaccionZernio(channel, payload);
    }
    return;
  }

  if (channel === "messenger") await processZernioMessengerEvent(payload);
  else if (channel === "tiktok") await processZernioTiktokEvent(payload);
  else await processZernioEvent(payload);
}
