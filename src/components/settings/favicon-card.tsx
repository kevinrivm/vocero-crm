"use client";

import { systemText } from "@/lib/i18n";

import { useI18n } from "@/components/i18n-provider";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImageUp, Trash2 } from "lucide-react";
import type { Branding } from "@/lib/branding";
import {
  faviconHref,
  FAVICON_MIMES,
  MAX_FAVICON_BYTES,
} from "@/lib/favicon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * El icono de la pestaña.
 *
 * Se muestra SIEMPRE una vista previa: sin logo subido, la del icono generado
 * con la inicial y el acento. Así queda claro que la instancia ya tiene uno y
 * que subir algo es reemplazarlo, no estrenarlo.
 */
export function FaviconCard({ branding }: { branding: Branding }) {
  const { t: tr } = useI18n();

  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Cambia con cada carga para que la vista previa no se quede con la anterior.
  const [rev, setRev] = useState(0);
  const [actual, setActual] = useState(branding.favicon);

  const src = `${faviconHref({ ...branding, favicon: actual })}&r=${rev}`;

  async function subir(file: File) {
    setError(null);
    if (file.size > MAX_FAVICON_BYTES) {
      setError(
        tr("El icono no puede pasar de {v0} KB.", {v0: Math.round(MAX_FAVICON_BYTES / 1024)})
      );
      return;
    }
    setSubiendo(true);
    const res = await fetch("/api/settings/branding/favicon", {
      method: "PUT",
      headers: { "content-type": file.type || "application/octet-stream" },
      body: file,
    }).catch(() => null);
    setSubiendo(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? tr("No se pudo subir el icono"));
      return;
    }
    const data = (await res.json()) as { favicon: Branding["favicon"] };
    setActual(data.favicon);
    setRev((v) => v + 1);
    router.refresh(); // el layout raíz vuelve a emitir el <link rel="icon">
  }

  async function quitar() {
    setError(null);
    setSubiendo(true);
    const res = await fetch("/api/settings/branding/favicon", {
      method: "DELETE",
    }).catch(() => null);
    setSubiendo(false);
    if (!res?.ok) {
      setError(tr("No se pudo quitar el icono"));
      return;
    }
    setActual(null);
    setRev((v) => v + 1);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tr("Logo del negocio")}</CardTitle>
        <p className="text-sm text-text-3">
          {tr("Se ve en la pestaña del navegador y en la barra lateral del CRM.")}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          {/* Sin next/image a propósito: es un archivo servido por una ruta
              propia, de 64 px y ya optimizado. Pasarlo por el optimizador
              sería trabajo de servidor para no ahorrar nada. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={tr("Vista previa del icono de la pestaña")}
            width={48}
            height={48}
            className="h-12 w-12 rounded-lg border bg-card object-contain"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm">
              {actual ? tr("Logo propio") : tr("Generado con tu marca")}
            </p>
            <p className="mt-0.5 text-xs text-text-3">
              {actual
                ? tr("Reemplaza al generado en la pestaña y en la barra lateral. Puedes quitarlo para volver a él.")
                : tr("La inicial sobre tu color de acento. Sube tu logo para reemplazarla.")}
            </p>
          </div>
        </div>

        <input
          ref={input}
          type="file"
          accept={FAVICON_MIMES.join(",")}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            // Se limpia el valor para que subir el MISMO archivo dos veces
            // vuelva a disparar el evento.
            e.target.value = "";
            if (f) void subir(f);
          }}
        />

        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={subiendo}
            onClick={() => input.current?.click()}
          >
            <ImageUp className="h-4 w-4" />
            {subiendo ? tr("Subiendo…") : actual ? tr("Cambiar logo") : tr("Subir logo")}
          </Button>
          {actual && (
            <Button variant="ghost" disabled={subiendo} onClick={() => void quitar()}>
              <Trash2 className="h-4 w-4" /> {tr(" Quitar")}</Button>
          )}
        </div>

        <p className="text-xs text-text-3">
          {tr("PNG, SVG, ICO, JPEG o WebP, hasta")}{" "}
          {Math.round(MAX_FAVICON_BYTES / 1024)} {tr(" KB. Cuadrado y con fondo transparente se ve mejor: se dibuja sobre tu color de acento.")}</p>

        {error && <p className="text-sm text-destructive">{systemText(tr.locale, error)}</p>}
      </CardContent>
    </Card>
  );
}
