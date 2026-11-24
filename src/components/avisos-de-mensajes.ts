"use client";

import { useEffect } from "react";

/**
 * 045 — Avisos de mensaje nuevo, como WhatsApp Web: un sonido corto cuando
 * entra un mensaje y, en la pestaña, cuántos chats tienen mensajes sin leer
 * («(3) Vocero»).
 *
 * El sonido se sintetiza con Web Audio (dos notas cortas): no hay archivo que
 * servir ni que licenciar. El navegador no deja sonar nada antes de que la
 * persona toque la página, así que el contexto de audio se despierta con el
 * primer clic o tecla.
 */

const CLAVE_SONIDO = "vocero.sonido";
/** Una ráfaga de mensajes suena una vez, no diez. */
const PAUSA_ENTRE_SONIDOS_MS = 1500;

let conversacionAbierta: string | null = null;
let contexto: AudioContext | null = null;
let ultimoSonido = 0;

/** La Bandeja dice qué conversación está mirando el operador. */
export function setConversacionAbierta(id: string | null): void {
  conversacionAbierta = id;
}

export function sonidoActivado(): boolean {
  try {
    return window.localStorage.getItem(CLAVE_SONIDO) !== "off";
  } catch {
    return true;
  }
}

export function guardarSonido(activado: boolean): void {
  try {
    window.localStorage.setItem(CLAVE_SONIDO, activado ? "on" : "off");
  } catch {}
}

function obtenerContexto(): AudioContext | null {
  if (contexto) return contexto;
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  try {
    contexto = new Ctx();
  } catch {
    contexto = null;
  }
  return contexto;
}

/** Despierta el audio con el primer gesto: antes, el navegador lo bloquea. */
export function useDesbloquearAudio(): void {
  useEffect(() => {
    const despertar = () => {
      const ctx = obtenerContexto();
      if (ctx?.state === "suspended") void ctx.resume().catch(() => {});
    };
    window.addEventListener("pointerdown", despertar, { passive: true });
    window.addEventListener("keydown", despertar);
    return () => {
      window.removeEventListener("pointerdown", despertar);
      window.removeEventListener("keydown", despertar);
    };
  }, []);
}

/** Dos notas cortas y suaves (≈ 0.3 s). Sin audio disponible, no hace nada. */
export function reproducirAviso(): void {
  const ahora = Date.now();
  if (ahora - ultimoSonido < PAUSA_ENTRE_SONIDOS_MS) return;
  const ctx = obtenerContexto();
  if (!ctx || ctx.state !== "running") return;
  ultimoSonido = ahora;
  const t0 = ctx.currentTime;
  for (const [i, frecuencia] of [988, 1319].entries()) {
    const inicio = t0 + i * 0.11;
    const osc = ctx.createOscillator();
    const vol = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = frecuencia;
    vol.gain.setValueAtTime(0.0001, inicio);
    vol.gain.exponentialRampToValueAtTime(0.18, inicio + 0.015);
    vol.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.18);
    osc.connect(vol).connect(ctx.destination);
    osc.start(inicio);
    osc.stop(inicio + 0.2);
  }
}

/**
 * 077 — El aviso de «un cliente lleva 15 min esperando a una persona». Tiene
 * que distinguirse del de mensaje nuevo sin verlo: tres notas graves que
 * bajan (≈ 0.7 s), más largas y más fuertes que las dos agudas de aquel. Sin
 * audio disponible (nadie ha tocado la página todavía), no suena: el aviso
 * se ve igual.
 */
export function reproducirAvisoEspera(): void {
  const ctx = obtenerContexto();
  if (!ctx || ctx.state !== "running") return;
  const t0 = ctx.currentTime;
  for (const [i, frecuencia] of [659, 523, 392].entries()) {
    const inicio = t0 + i * 0.22;
    const osc = ctx.createOscillator();
    const vol = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = frecuencia;
    vol.gain.setValueAtTime(0.0001, inicio);
    vol.gain.exponentialRampToValueAtTime(0.3, inicio + 0.02);
    vol.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.32);
    osc.connect(vol).connect(ctx.destination);
    osc.start(inicio);
    osc.stop(inicio + 0.34);
  }
}

/**
 * ¿Suena este mensaje? Solo los que escribe el cliente, con el sonido
 * encendido, y no si el operador ya está mirando esa conversación.
 */
export function debeSonar(m: { direction?: string; conversationId: string }): boolean {
  if (m.direction !== "in" || !sonidoActivado()) return false;
  const mirando =
    document.visibilityState === "visible" &&
    document.hasFocus() &&
    conversacionAbierta === m.conversationId;
  return !mirando;
}

/** «(3) Vocero — CRM»; sin pendientes, el título tal cual. */
export function tituloConNoLeidos(titulo: string, chats: number): string {
  const base = titulo.replace(/^\(\d+\+?\)\s+/, "");
  if (chats <= 0) return base;
  return `(${chats > 99 ? "99+" : chats}) ${base}`;
}

/**
 * Mantiene el contador en el título de la pestaña. Next reescribe el título
 * al navegar, así que se vuelve a poner cada vez que cambia.
 */
export function useTituloNoLeidos(chats: number): void {
  useEffect(() => {
    const aplicar = () => {
      const deseado = tituloConNoLeidos(document.title, chats);
      if (document.title !== deseado) document.title = deseado;
    };
    aplicar();
    const observador = new MutationObserver(aplicar);
    observador.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => {
      observador.disconnect();
      document.title = tituloConNoLeidos(document.title, 0);
    };
  }, [chats]);
}

/**
 * 056 — Abre una conversación desde un aviso. Además de navegar, avisa a la
 * Bandeja ya montada: si la URL no cambia (otro aviso del mismo chat), el
 * parámetro solo no bastaría.
 */
export const EVENTO_ABRIR_CONVERSACION = "vocero:abrir-conversacion";
export function abrirConversacionDeAviso(
  url: string,
  navegar: (url: string) => void
): void {
  navegar(url);
  const id = new URL(url, window.location.origin).searchParams.get("conversation");
  if (id) window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_CONVERSACION, { detail: id }));
}

/** 056 — El permiso de avisos de este navegador, o "unsupported" si no hay API. */
export function permisoAvisos(): NotificationPermission | "unsupported" {
  return typeof window !== "undefined" && "Notification" in window
    ? Notification.permission
    : "unsupported";
}

/**
 * 056 · D3 — Muestra el aviso del sistema. Con service worker (048) va por
 * `showNotification`, lo único que acepta Chrome en Android; sin él, por
 * `new Notification`. El `tag` por conversación reemplaza el aviso anterior
 * de ese chat. Nunca lanza: un aviso que no sale no rompe la Bandeja.
 */
export async function mostrarAvisoSistema(a: {
  titulo: string;
  cuerpo: string;
  tag: string;
  url: string;
  icono?: string;
  alAbrir: (url: string) => void;
}): Promise<void> {
  const opciones: NotificationOptions & { renotify?: boolean } = {
    body: a.cuerpo,
    tag: a.tag,
    renotify: true,
    icon: a.icono,
    data: { url: a.url },
  };
  try {
    const registro = await navigator.serviceWorker?.getRegistration();
    if (registro) {
      await registro.showNotification(a.titulo, opciones);
      return;
    }
  } catch {
    // Sin service worker usable: se intenta con la API de la página.
  }
  try {
    const n = new Notification(a.titulo, opciones);
    n.onclick = () => {
      window.focus();
      a.alAbrir(a.url);
      n.close();
    };
  } catch {
    // El navegador no deja avisar desde la página: no pasa nada.
  }
}
