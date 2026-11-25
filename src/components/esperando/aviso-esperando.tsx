"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, BellOff, Hourglass, X } from "lucide-react";
import {
  claveDeEspera,
  guardarAvisadas,
  leerAvisadas,
  nivelDeEspera,
  nuevasParaAvisar,
  pedirVerEsperando,
  textoAviso,
  textoCintillo,
  URL_AJUSTE_ESPERANDO,
  URL_ESPERANDO,
  type AvisoEsperandoDto,
  type Espera,
  type NivelEspera,
} from "@/lib/esperando";
import { urlDeConversacion } from "@/lib/avisos-sistema";
import { cn } from "@/lib/utils";
import {
  abrirConversacionDeAviso,
  mostrarAvisoSistema,
  permisoAvisos,
  reproducirAvisoEspera,
} from "@/components/avisos-de-mensajes";
import { guardarAvisoEsperando, useCambiosDeAjuste, useEsperas } from "./estado";

/** Los tres colores de la espera, con los tokens del tema (claro y oscuro). */
export const COLOR_NIVEL: Record<NivelEspera, string> = {
  neutro: "border-border-strong bg-subtle text-text-2",
  ambar: "border-warning-soft bg-warning-tint text-warning-text",
  rojo: "border-danger-soft bg-danger-tint text-danger-text",
};

/** «Atender»: con una sola, abre esa conversación; con varias, la pestaña. */
function urlParaAtender(esperas: readonly Espera[]): string {
  const una = esperas.length === 1 ? esperas[0] : null;
  return una ? `${urlDeConversacion(una.id)}&vista=esperando` : URL_ESPERANDO;
}

/**
 * 077 — El cintillo de arriba de toda la app y el aviso de los 15 minutos.
 *
 * - Cintillo: con al menos un cliente esperando, «N clientes esperan a una
 *   persona · el que más lleva: X min», del color del que más lleva, con
 *   enlace a la pestaña «Esperando». Sin ninguno no ocupa espacio.
 * - Aviso: cuando una espera pasa de 15 min, una vez por espera y por persona
 *   (en este navegador). Varias a la vez salen en UN aviso con un solo
 *   sonido. El sonido es de cada persona y se apaga desde aquí.
 * - Cada persona elige en Ajustes → Apariencia si ve los dos (lo de siempre),
 *   solo el aviso o nada; «Ocultar» en el cintillo lleva a ese ajuste.
 */
export function AvisoEsperando({
  userId,
  inicial,
}: {
  userId: string;
  /** Qué eligió ver esta persona, resuelto en el servidor (sin parpadeo). */
  inicial: AvisoEsperandoDto;
}) {
  const router = useRouter();
  const esperas = useEsperas();
  const [ajuste, setAjuste] = useState<AvisoEsperandoDto>(inicial);
  const sonidoRef = useRef(inicial.sonido);
  sonidoRef.current = ajuste.sonido;
  const modo = ajuste.modo;
  const [aviso, setAviso] = useState<Espera[] | null>(null);
  useCambiosDeAjuste((a) => {
    setAjuste(a);
    if (a.modo === "nada") setAviso(null);
  });
  const avisadas = useRef<Map<string, number> | null>(null);

  // Las esperas nuevas que cruzan los 15 min: se anotan ANTES de avisar, así
  // un refresco de la lista a mitad no repite el aviso.
  useEffect(() => {
    // Con «Nada» ni se anotan: si vuelve a encenderlo, avisa lo que pase de ahí.
    if (!esperas || modo === "nada") return;
    avisadas.current ??= leerAvisadas(userId);
    const nuevas = nuevasParaAvisar(esperas, avisadas.current);
    if (nuevas.length === 0) return;
    const ahora = Date.now();
    for (const e of nuevas) avisadas.current.set(claveDeEspera(e), ahora);
    guardarAvisadas(userId, avisadas.current);
    setAviso(nuevas);
    if (sonidoRef.current) reproducirAvisoEspera();
    // Con la pestaña de fondo y permiso dado, también un aviso del sistema.
    if (document.visibilityState !== "visible" && permisoAvisos() === "granted") {
      void mostrarAvisoSistema({
        titulo: "Esperando a una persona",
        cuerpo: textoAviso(nuevas),
        tag: "esperando",
        url: urlParaAtender(nuevas),
        alAbrir: (url) => abrirConversacionDeAviso(url, (u) => router.push(u)),
      });
    }
  }, [esperas, userId, router, modo]);

  // Si ya nadie de los del aviso espera (alguien contestó), se va solo.
  const vigentes = aviso && esperas ? aviso.filter((p) => esperas.some((e) => e.id === p.id)) : null;
  useEffect(() => {
    if (aviso && vigentes && vigentes.length === 0) setAviso(null);
  }, [aviso, vigentes]);

  const sonido = ajuste.sonido;
  const botonSonido = (
    <button
      type="button"
      onClick={() => guardarAvisoEsperando({ ...ajuste, sonido: !sonido })}
      aria-pressed={sonido}
      aria-label={sonido ? "Sonido del aviso «Esperando»: activado" : "Sonido del aviso «Esperando»: apagado"}
      title={sonido ? "Apagar el sonido de este aviso (solo para ti)" : "Encender el sonido de este aviso"}
      data-esperando-sonido
      className="shrink-0 rounded-md p-1 opacity-80 hover:bg-black/5 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-white/10"
    >
      {sonido ? <Bell className="h-4 w-4" strokeWidth={1.8} /> : <BellOff className="h-4 w-4" strokeWidth={1.8} />}
    </button>
  );

  if (!esperas || esperas.length === 0 || modo === "nada") return null;
  const masAntigua = esperas[0]!;
  const nivel = nivelDeEspera(masAntigua.minutos);
  const mostrarAviso = vigentes && vigentes.length > 0 ? vigentes : null;

  return (
    <>
      {modo === "todo" && (
        <div
          role="status"
          data-esperando-cintillo
          data-total={esperas.length}
          className={cn(
            "flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-[13px] lg:rounded-[var(--radio-tarjeta)] lg:border",
            COLOR_NIVEL[nivel]
          )}
        >
          <Hourglass className="h-4 w-4 shrink-0" strokeWidth={1.8} aria-hidden />
          <span className="min-w-0 flex-1 font-medium">{textoCintillo(esperas.length, masAntigua.minutos)}</span>
          <Link
            href={URL_ESPERANDO}
            onClick={() => pedirVerEsperando()}
            data-esperando-ver
            className="shrink-0 rounded-md px-2 py-0.5 font-semibold underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Ver quién espera
          </Link>
          {botonSonido}
          <button
            type="button"
            onClick={() => router.push(URL_AJUSTE_ESPERANDO)}
            title="Elegir qué ves de este aviso (solo para ti)"
            data-esperando-ocultar
            className="shrink-0 rounded-md px-2 py-0.5 text-[12.5px] font-semibold opacity-80 hover:bg-black/5 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-white/10"
          >
            Ocultar
          </button>
        </div>
      )}

      {mostrarAviso && (
        <div
          role="alertdialog"
          aria-labelledby="esperando-aviso-titulo"
          data-esperando-aviso
          className="fixed bottom-4 right-4 z-50 w-[min(360px,calc(100vw-2rem))] rounded-2xl border bg-popover p-4 text-popover-foreground shadow-pop"
        >
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border",
                COLOR_NIVEL.rojo
              )}
            >
              <Hourglass className="h-4 w-4" strokeWidth={1.9} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p id="esperando-aviso-titulo" className="text-[14px] font-semibold leading-snug">
                {textoAviso(mostrarAviso)}
              </p>
              {mostrarAviso.length > 1 && (
                <p className="mt-1 truncate text-[12.5px] text-text-3">
                  {mostrarAviso.map((e) => e.nombre).join(", ")}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setAviso(null)}
              aria-label="Cerrar el aviso"
              className="shrink-0 rounded-md p-1 text-text-3 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              data-esperando-atender
              onClick={() => {
                const url = urlParaAtender(mostrarAviso);
                setAviso(null);
                pedirVerEsperando();
                abrirConversacionDeAviso(url, (u) => router.push(u));
              }}
              className="rounded-md bg-brand px-3 py-1.5 text-[13px] font-semibold text-brand-fg hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Atender
            </button>
            <button
              type="button"
              onClick={() => setAviso(null)}
              className="rounded-md px-3 py-1.5 text-[13px] font-semibold text-text-2 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Cerrar
            </button>
            <span className="ml-auto flex items-center gap-1 text-[12px] text-text-3">
              {sonido ? "Con sonido" : "Sin sonido"}
              {botonSonido}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
