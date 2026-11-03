/**
 * Adaptador y cliente para Evolution API (WhatsApp Multi-Device / QR Gateway).
 */

export interface EvolutionSendResult {
  id: string;
  status: string;
}

/**
 * Normaliza la URL base de Evolution API asegurando que no termine en slash.
 */
function cleanBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/**
 * Normaliza el número de destino para Evolution API.
 * Evolution espera típicamente el número con código de país sin signos '+' o '@s.whatsapp.net'.
 */
function cleanRecipient(to: string): string {
  return to.replace(/@.*$/, "").replace(/\D/g, "");
}

/**
 * Envía un mensaje de texto plano a través de Evolution API (v1 / v2 compatible).
 */
export async function sendEvolutionText(input: {
  evoUrl: string;
  evoInstance: string;
  evoApiKey?: string | null;
  to: string;
  text: string;
}): Promise<EvolutionSendResult> {
  const baseUrl = cleanBaseUrl(input.evoUrl);
  const instance = encodeURIComponent(input.evoInstance.trim());
  const recipient = cleanRecipient(input.to);

  const endpoint = `${baseUrl}/message/sendText/${instance}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (input.evoApiKey?.trim()) {
    headers["apikey"] = input.evoApiKey.trim();
  }

  const payload = {
    number: recipient,
    text: input.text,
    options: {
      delay: 1000,
      presence: "composing",
    },
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Evolution API error (${response.status}): ${errorText || response.statusText}`
    );
  }

  const data = (await response.json().catch(() => ({}))) as any;
  const messageId =
    data?.key?.id ||
    data?.message?.key?.id ||
    data?.id ||
    `evo_${Date.now()}`;

  return {
    id: String(messageId),
    status: "sent",
  };
}

/**
 * Consulta el estado de la instancia en Evolution API.
 */
export async function checkEvolutionInstance(input: {
  evoUrl: string;
  evoInstance: string;
  evoApiKey?: string | null;
}): Promise<{ connected: boolean; state: string }> {
  try {
    const baseUrl = cleanBaseUrl(input.evoUrl);
    const instance = encodeURIComponent(input.evoInstance.trim());
    const endpoint = `${baseUrl}/instance/connectionState/${instance}`;

    const headers: Record<string, string> = {};
    if (input.evoApiKey?.trim()) {
      headers["apikey"] = input.evoApiKey.trim();
    }

    const response = await fetch(endpoint, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    if (!response.ok) {
      return { connected: false, state: "error" };
    }

    const data = (await response.json().catch(() => ({}))) as any;
    const state =
      data?.instance?.state ||
      data?.state ||
      data?.status ||
      "disconnected";

    const isConnected = state === "open" || state === "connected";
    return { connected: isConnected, state };
  } catch {
    return { connected: false, state: "unreachable" };
  }
}

/**
 * Solicita o genera el código QR para vincular una instancia de Evolution API.
 * Si la instancia no existe en el servidor, la crea automáticamente.
 * Si existe, consulta /instance/connect/{instance}.
 */
export async function getEvolutionQrCode(input: {
  evoUrl: string;
  instanceName: string;
  evoApiKey?: string | null;
  webhookUrl?: string | null;
}): Promise<{
  success: boolean;
  qrCode?: string;
  pairingCode?: string | null;
  state?: string;
  message?: string;
  error?: string;
}> {
  const baseUrl = cleanBaseUrl(input.evoUrl);
  const instance = encodeURIComponent(input.instanceName.trim());

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (input.evoApiKey?.trim()) {
    headers["apikey"] = input.evoApiKey.trim();
  }

  try {
    // 1. Intentar consultar /instance/connect/{instance}
    let res = await fetch(`${baseUrl}/instance/connect/${instance}`, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    let data: any = null;

    // 2. Si la instancia no existe (404 / 400), crearla automáticamente
    if (!res.ok) {
      const createPayload = {
        instanceName: input.instanceName.trim(),
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
      };

      res = await fetch(`${baseUrl}/instance/create`, {
        method: "POST",
        headers,
        body: JSON.stringify(createPayload),
        cache: "no-store",
      });
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return {
        success: false,
        error: `Error de Evolution API (${res.status}): ${errText || res.statusText}`,
      };
    }

    data = (await res.json().catch(() => ({}))) as any;

    // Extraer el código QR en base64
    const rawBase64: string | undefined =
      data?.base64 ||
      data?.qrcode?.base64 ||
      data?.instance?.qrcode?.base64;

    const pairingCode: string | null =
      data?.pairingCode ||
      data?.qrcode?.pairingCode ||
      null;

    const rawCode: string | undefined =
      data?.code ||
      data?.qrcode?.code;

    let qrCode = "";
    if (rawBase64) {
      qrCode = rawBase64.startsWith("data:")
        ? rawBase64
        : `data:image/png;base64,${rawBase64}`;
    } else if (rawCode) {
      // Fallback a generador de imagen de QR estándar con el payload raw
      qrCode = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=${encodeURIComponent(rawCode)}`;
    }

    // Configurar webhook automáticamente si se proporcionó webhookUrl
    if (input.webhookUrl?.trim()) {
      try {
        await fetch(`${baseUrl}/webhook/set/${instance}`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            enabled: true,
            url: input.webhookUrl.trim(),
            webhookByEvents: false,
            events: [
              "MESSAGES_UPSERT",
              "CONNECTION_UPDATE",
              "QRCODE_UPDATED",
            ],
          }),
          cache: "no-store",
        });
      } catch {
        // No bloquear la entrega del QR si el webhook da advertencia
      }
    }

    const state =
      data?.instance?.state ||
      data?.state ||
      "connecting";

    if (!qrCode && (state === "open" || state === "connected")) {
      return {
        success: true,
        state: "open",
        message: "La instancia ya se encuentra conectada a WhatsApp",
      };
    }

    if (!qrCode) {
      return {
        success: false,
        error: "No se recibió un código QR válido de la instancia de Evolution API",
      };
    }

    return {
      success: true,
      qrCode,
      pairingCode,
      state,
      message: "Código QR generado correctamente",
    };
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Error al conectar con Evolution API";
    return {
      success: false,
      error: `No se pudo comunicar con el servidor Evolution en «${baseUrl}»: ${msg}`,
    };
  }
}

