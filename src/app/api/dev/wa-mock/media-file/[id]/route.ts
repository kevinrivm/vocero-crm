import { mockGuard } from "@/lib/dev-guard";
import { empaquetarOgg } from "@/lib/audio/webm-ogg";
import { pngDePrueba } from "@/server/dev/png-de-prueba";

/**
 * Binario de prueba del wa-mock (media proxy del bot). La metadata del mock de
 * Graph apunta aquí como la "url" efímera del adjunto.
 *
 * 018 — También sirve los creativos de los anuncios simulados. Los ids que
 * empiezan por `creativo` devuelven un PNG real; algunos provocan a propósito
 * los caminos que la copia debe rechazar o reintentar.
 */
export const dynamic = "force-dynamic";

/** Veces que se ha pedido cada creativo, para simular fallos que se curan. */
const pedidos = new Map<string, number>();

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const guard = mockGuard();
  if (guard) return guard;
  const { id } = await ctx.params;

  if (id.startsWith("creativo")) {
    if (id === "creativo-enorme") {
      // Más grande que la cota de una miniatura.
      return new Response(new Uint8Array(400_000), {
        headers: { "content-type": "image/jpeg" },
      });
    }
    if (id === "creativo-svg") {
      // Un SVG servido desde nuestro origen podría ejecutar scripts.
      return new Response('<svg xmlns="http://www.w3.org/2000/svg"/>', {
        headers: { "content-type": "image/svg+xml" },
      });
    }
    if (id === "creativo-redirige") {
      // Un salto hacia un origen que no es el permitido y que, si se siguiera,
      // SÍ devolvería un PNG: este mismo servidor por otro nombre (localhost ↔
      // 127.0.0.1). Así la prueba demuestra que el salto se revalida, y no que
      // el destino falló; y no sale de la máquina.
      const aqui = new URL(req.url);
      const otro = aqui.hostname === "127.0.0.1" ? "localhost" : "127.0.0.1";
      return new Response(null, {
        status: 302,
        headers: {
          location: `${aqui.protocol}//${otro}:${aqui.port}/api/dev/wa-mock/media-file/creativo-destino-del-salto`,
        },
      });
    }
    const vez = (pedidos.get(id) ?? 0) + 1;
    pedidos.set(id, vez);
    if (id.startsWith("creativo-lento") && vez === 1) {
      // La primera vez tarda más que el tiempo de espera de la copia.
      await new Promise((r) => setTimeout(r, 6_500));
    }
    if (id.startsWith("creativo-falla") && vez <= 2) {
      // Falla la copia y su reintento; a la tercera, ya responde.
      return new Response(null, { status: 503 });
    }
    return new Response(new Uint8Array(pngDePrueba(id)), {
      headers: { "content-type": "image/png" },
    });
  }

  // 074 — El CDN de los adjuntos de Instagram, Messenger y TikTok: la URL
  // firmada que trae el webhook apunta aquí. `adjunto-caducado…` responde como
  // una firma vencida (403), `adjunto-enorme…` pasa del tope de una foto y
  // `adjunto-redirige…` salta a este mismo servidor por otro nombre
  // (localhost ↔ 127.0.0.1): la descarga debe revalidar el salto y negarse.
  if (id.startsWith("adjunto")) {
    if (id.startsWith("adjunto-caducado")) return new Response(null, { status: 403 });
    if (id.startsWith("adjunto-enorme")) {
      return new Response(new Uint8Array(11 * 1024 * 1024), {
        headers: { "content-type": "image/jpeg" },
      });
    }
    if (id.startsWith("adjunto-redirige")) {
      const aqui = new URL(req.url);
      const otro = aqui.hostname === "127.0.0.1" ? "localhost" : "127.0.0.1";
      return new Response(null, {
        status: 302,
        headers: {
          location: `${aqui.protocol}//${otro}:${aqui.port}/api/dev/wa-mock/media-file/adjunto-destino-del-salto`,
        },
      });
    }
    if (id.startsWith("adjunto-pdf")) {
      return new Response(Buffer.from("%PDF-1.4\n% adjunto de prueba\n"), {
        headers: { "content-type": "application/pdf" },
      });
    }
    return new Response(new Uint8Array(pngDePrueba(id)), {
      headers: { "content-type": "image/png" },
    });
  }

  // 044 — Una nota de voz de verdad (Ogg/Opus, 3 s de silencio) para que el
  // reproductor la pueda decodificar.
  if (id.includes("audio")) {
    const silencio = Array.from({ length: 150 }, () => new Uint8Array([0xf8, 0xff, 0xfe]));
    return new Response(new Uint8Array(empaquetarOgg(undefined, silencio)), {
      headers: { "content-type": "audio/ogg; codecs=opus" },
    });
  }

  // 045 — Una foto de verdad (grande, como las de un teléfono), para probar
  // que el hilo se queda abajo cuando termina de cargar.
  if (id.includes("imagen")) {
    return new Response(new Uint8Array(pngDePrueba(id, 600)), {
      headers: { "content-type": "image/png" },
    });
  }

  const isPdf = id.includes("pdf");
  return new Response(Buffer.from("wa-mock-media"), {
    headers: {
      "content-type": isPdf ? "application/pdf" : "image/jpeg",
    },
  });
}
