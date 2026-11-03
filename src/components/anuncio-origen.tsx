"use client";

import { useI18n } from "@/components/i18n-provider";

import { useState } from "react";
import { ExternalLink, Megaphone } from "lucide-react";
import type { AnuncioDto } from "@/lib/types";
import { etiquetaDeOrigen, titularDeOrigen } from "@/lib/anuncios";

/**
 * 019 — Miniatura del creativo para listas y tablas (Resultados). Sin imagen,
 * o si deja de servirse, queda el megáfono en el mismo hueco para que las filas
 * no bailen.
 */
export function MiniaturaDeAnuncio({
  imageAssetId,
  alt,
}: {
  imageAssetId: string | null;
  alt: string;
}) {
  const [rota, setRota] = useState(false);
  if (!imageAssetId || rota) {
    return (
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded border bg-subtle text-text-3"
        aria-hidden
      >
        <Megaphone className="h-4 w-4" strokeWidth={1.7} />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- adjunto privado servido con sesión; no hay host que optimizar
    <img
      src={`/api/media/${imageAssetId}`}
      alt={alt}
      loading="lazy"
      onError={() => setRota(true)}
      className="h-9 w-9 shrink-0 rounded border bg-background object-cover"
    />
  );
}

/**
 * 018 — De qué anuncio llegó esta persona.
 *
 * La misma tarjeta en la bandeja y en el cajón del trato: la pregunta "¿quién
 * la trajo?" se hace en los dos sitios. Va entera o no va: una conversación
 * orgánica no enseña un hueco vacío.
 *
 * Solo lo que Meta manda en el `referral`: el nombre del anuncio, la campaña o
 * el conjunto no vienen ahí, y pedirlos exigiría la API de Marketing.
 */
export function AnuncioOrigen({ anuncio }: { anuncio: AnuncioDto }) {
  const { t: tr } = useI18n();

  // La imagen puede no estar (caducó antes de copiarse, host no permitido) o
  // dejar de servirse: la tarjeta sigue diciendo lo importante sin ella.
  const [imagenRota, setImagenRota] = useState(false);
  const etiqueta = etiquetaDeOrigen(anuncio.sourceType);
  const titular = titularDeOrigen(anuncio.headline, anuncio.sourceType);
  const fecha = new Date(anuncio.capturedAt).toLocaleDateString(tr.intl, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div
      className="rounded-md border border-info-soft bg-info-tint px-3 py-2.5"
      data-anuncio-origen={anuncio.sourceId ?? ""}
    >
      <p className="flex items-center gap-1.5 text-[13px] font-medium text-info-text">
        <Megaphone className="h-4 w-4 shrink-0" strokeWidth={1.7} />
        {etiqueta === "Anuncio" ? tr("Llegó por un anuncio") : tr("Llegó por una publicación")}
      </p>

      <div className="mt-2 flex items-start gap-2.5">
        {anuncio.imageAssetId && !imagenRota && (
          // eslint-disable-next-line @next/next/no-img-element -- adjunto privado servido con sesión; no hay host que optimizar
          <img
            src={`/api/media/${anuncio.imageAssetId}`}
            alt={tr("Creativo: {v0}", {v0: titular})}
            loading="lazy"
            onError={() => setImagenRota(true)}
            className="h-14 w-14 shrink-0 rounded border border-info-soft bg-background object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="break-words text-[13px] font-semibold leading-snug text-foreground">
            {titular}
          </p>
          {anuncio.body && (
            <p className="mt-0.5 line-clamp-3 break-words text-xs text-text-2">
              {anuncio.body}
            </p>
          )}
        </div>
      </div>

      <div className="mt-2 space-y-0.5 text-[11px] text-text-3">
        <p>
          {tr("Primer mensaje · ")}{fecha}
          {anuncio.mediaType === "video" ? tr(" · con video") : ""}
        </p>
        {anuncio.sourceId && (
          <p className="truncate font-mono" title={anuncio.sourceId}>
            {tr("ID ")}{anuncio.sourceId}
          </p>
        )}
        {/* Solo la presencia, y solo en una instancia que atribuye: el valor
            del identificador de clic no sale del servidor. */}
        {anuncio.hasCtwaClid && <p>{tr("Meta identificó el clic")}</p>}
      </div>

      {anuncio.sourceUrl && (
        <a
          href={anuncio.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-text underline underline-offset-2 hover:text-brand"
        >
          {tr("Ver ")}{etiqueta.toLowerCase()}
          <ExternalLink className="h-3 w-3" strokeWidth={1.8} />
        </a>
      )}
    </div>
  );
}
