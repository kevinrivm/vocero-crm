"use client";

import { useI18n } from "@/components/i18n-provider";

import { useEffect, useRef, useState } from "react";
import { Send, Square, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AudioPlayer, formatoTiempo } from "./audio-player";

/**
 * 044 — Grabar una nota de voz en el compositor, como en WhatsApp.
 *
 * Graba con `MediaRecorder` en lo que dé el navegador: Ogg/Opus (Firefox),
 * WebM/Opus (Chrome, Edge) o MP4/AAC (Safari). El servidor pasa el WebM a Ogg
 * sin recodificar (`src/lib/audio/webm-ogg.ts`), que es lo único que WhatsApp
 * muestra como nota de voz; el MP4 sale como audio normal.
 */

const FORMATOS = [
  { mime: "audio/ogg;codecs=opus", ext: "ogg" },
  { mime: "audio/webm;codecs=opus", ext: "webm" },
  { mime: "audio/mp4", ext: "m4a" },
] as const;

/** Tope de una nota: 15 min a 24 kbps son ~2.7 MB, lejos de los 16 MB de Meta. */
const MAX_SEGUNDOS = 15 * 60;
const NIVELES = 32;

export type NotaGrabada = { archivo: File; segundos: number };

function elegirFormato() {
  if (typeof MediaRecorder === "undefined") return null;
  return FORMATOS.find((f) => MediaRecorder.isTypeSupported(f.mime)) ?? null;
}

function motivoDelError(err: unknown): string {
  const nombre = err instanceof DOMException ? err.name : "";
  if (nombre === "NotAllowedError" || nombre === "SecurityError") {
    return "Permite el micrófono en el navegador para grabar notas de voz.";
  }
  if (nombre === "NotFoundError" || nombre === "OverconstrainedError") {
    return "No se encontró un micrófono en este equipo.";
  }
  if (nombre === "NotReadableError") {
    return "Otro programa está usando el micrófono. Ciérralo y vuelve a intentar.";
  }
  return "No se pudo empezar a grabar. Vuelve a intentar.";
}

export function VoiceRecorder({
  onSend,
  onCancel,
  onError,
}: {
  /** Devuelve el error a enseñar, o null si salió. */
  onSend: (nota: NotaGrabada) => Promise<string | null>;
  onCancel: () => void;
  /** No se pudo grabar: se cierra la grabadora y el compositor dice por qué. */
  onError: (mensaje: string) => void;
}) {
  const { t: tr, text: tx } = useI18n();
  const [fase, setFase] = useState<"pidiendo" | "grabando" | "lista" | "enviando">("pidiendo");
  const [segundos, setSegundos] = useState(0);
  const [niveles, setNiveles] = useState<number[]>(() => Array(NIVELES).fill(0));
  const [nota, setNota] = useState<NotaGrabada | null>(null);
  const [vista, setVista] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorder = useRef<MediaRecorder | null>(null);
  const flujo = useRef<MediaStream | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const partes = useRef<Blob[]>([]);
  const inicio = useRef(0);
  const alTerminar = useRef<((n: NotaGrabada) => void) | null>(null);
  const descartada = useRef(false);

  function soltarMicrofono() {
    flujo.current?.getTracks().forEach((t) => t.stop());
    flujo.current = null;
    void ctx.current?.close().catch(() => {});
    ctx.current = null;
  }

  useEffect(() => {
    let vivo = true;
    let cuadro = 0;
    let reloj: ReturnType<typeof setInterval> | undefined;
    // En desarrollo React monta dos veces: la segunda grabación vale.
    descartada.current = false;

    (async () => {
      const formato = elegirFormato();
      if (!navigator.mediaDevices?.getUserMedia || !formato) {
        onError(
          window.isSecureContext
            ? "Este navegador no puede grabar audio. Prueba con Chrome, Edge, Firefox o Safari al día."
            : "Grabar notas de voz necesita abrir el CRM por https."
        );
        return;
      }
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
        });
      } catch (err) {
        if (vivo) onError(motivoDelError(err));
        return;
      }
      if (!vivo) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      flujo.current = stream;

      // El nivel del micrófono, para que se vea que está oyendo.
      try {
        const ac = new AudioContext();
        ctx.current = ac;
        const analizador = ac.createAnalyser();
        analizador.fftSize = 512;
        ac.createMediaStreamSource(stream).connect(analizador);
        const datos = new Uint8Array(analizador.fftSize);
        let ultimo = 0;
        const paso = (t: number) => {
          if (t - ultimo > 90) {
            ultimo = t;
            analizador.getByteTimeDomainData(datos);
            let suma = 0;
            for (const v of datos) suma += ((v - 128) / 128) ** 2;
            const rms = Math.min(1, Math.sqrt(suma / datos.length) * 4);
            setNiveles((n) => [...n.slice(1), rms]);
          }
          cuadro = requestAnimationFrame(paso);
        };
        cuadro = requestAnimationFrame(paso);
      } catch {
        // Sin medidor se graba igual.
      }

      const rec = new MediaRecorder(stream, {
        mimeType: formato.mime,
        audioBitsPerSecond: 24000,
      });
      recorder.current = rec;
      partes.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) partes.current.push(e.data);
      };
      rec.onstop = () => {
        const dur = Math.max(1, Math.round((performance.now() - inicio.current) / 1000));
        const tipo = rec.mimeType || formato.mime;
        const archivo = new File(partes.current, `nota-de-voz.${formato.ext}`, { type: tipo });
        soltarMicrofono();
        if (descartada.current) return;
        const n = { archivo, segundos: dur };
        const siguiente = alTerminar.current;
        alTerminar.current = null;
        if (siguiente) siguiente(n);
        else {
          setNota(n);
          setVista(URL.createObjectURL(archivo));
          setFase("lista");
        }
      };
      rec.start(250);
      inicio.current = performance.now();
      setFase("grabando");
      reloj = setInterval(() => {
        const s = Math.floor((performance.now() - inicio.current) / 1000);
        setSegundos(s);
        if (s >= MAX_SEGUNDOS && rec.state === "recording") rec.stop();
      }, 250);
    })();

    return () => {
      vivo = false;
      cancelAnimationFrame(cuadro);
      if (reloj) clearInterval(reloj);
      descartada.current = true;
      if (recorder.current?.state === "recording") recorder.current.stop();
      soltarMicrofono();
    };
    // Se graba una vez al abrir; los callbacks no reinician la grabación.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      if (vista) URL.revokeObjectURL(vista);
    },
    [vista]
  );

  function detener(): Promise<NotaGrabada> {
    return new Promise((ok) => {
      if (nota) return ok(nota);
      alTerminar.current = ok;
      if (recorder.current?.state === "recording") recorder.current.stop();
    });
  }

  async function enviar() {
    if (fase === "enviando" || fase === "pidiendo") return;
    const grabada = await detener();
    setNota(grabada);
    setFase("enviando");
    setError(null);
    const err = await onSend(grabada);
    if (err) {
      // Lo grabado no se pierde: queda para escucharlo o reintentar.
      setError(err);
      setVista((v) => v ?? URL.createObjectURL(grabada.archivo));
      setFase("lista");
    }
  }

  function descartar() {
    descartada.current = true;
    if (recorder.current?.state === "recording") recorder.current.stop();
    soltarMicrofono();
    onCancel();
  }

  return (
    <div data-voice-recorder={fase}>
      <div className="flex items-center gap-2 rounded-[23px] border border-border-strong bg-background py-1.5 pl-2 pr-1.5 shadow-sm">
        <button
          type="button"
          onClick={descartar}
          disabled={fase === "enviando"}
          aria-label={tr("Descartar nota de voz")}
          title={tr("Descartar")}
          className="rounded p-1.5 text-text-3 transition-colors hover:bg-secondary hover:text-destructive disabled:opacity-40"
        >
          <Trash2 className="h-[18px] w-[18px]" strokeWidth={1.7} />
        </button>

        {fase === "lista" || (fase === "enviando" && vista) ? (
          <AudioPlayer src={vista!} className="w-auto flex-1" />
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2.5" role="status" aria-live="polite">
            <span
              className={cn(
                "h-2.5 w-2.5 shrink-0 rounded-full bg-danger",
                fase === "grabando" && "animate-pulse"
              )}
            />
            <span className="w-10 shrink-0 font-mono text-[12.5px] tabular-nums text-foreground">
              {formatoTiempo(segundos)}
            </span>
            <span className="sr-only">
              {fase === "pidiendo" ? tr("Pidiendo el micrófono…") : tr("Grabando nota de voz")}
            </span>
            <div aria-hidden className="flex h-6 min-w-0 flex-1 items-center gap-px overflow-hidden">
              {niveles.map((n, i) => (
                <span
                  key={i}
                  className="min-w-0 flex-1 rounded-full bg-text-4"
                  style={{ height: `${Math.max(10, Math.round(n * 100))}%` }}
                />
              ))}
            </div>
            {fase === "grabando" && (
              <button
                type="button"
                onClick={() => recorder.current?.state === "recording" && recorder.current.stop()}
                aria-label={tr("Detener y escuchar")}
                title={tr("Detener y escuchar antes de enviar")}
                className="rounded-full p-1.5 text-danger-text transition-colors hover:bg-danger-tint"
              >
                <Square className="h-4 w-4" fill="currentColor" strokeWidth={0} />
              </button>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => void enviar()}
          disabled={fase === "pidiendo" || fase === "enviando"}
          aria-label={tr("Enviar nota de voz")}
          className={cn(
            "flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-full bg-brand text-brand-fg transition-[opacity,background-color] hover:bg-brand-hover",
            (fase === "pidiendo" || fase === "enviando") && "opacity-40"
          )}
        >
          <Send className="h-4 w-4" strokeWidth={1.7} />
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-xs text-destructive">
          {tx(error)}
        </p>
      )}
    </div>
  );
}
