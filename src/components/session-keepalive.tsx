"use client";

import { useEffect } from "react";
import { authClient } from "@/lib/auth/client";

/** Cada cuánto se vuelve a pedir la sesión con la pestaña abierta. */
const CADA_MS = 60 * 60 * 1000;

/**
 * Renueva la sesión desde el navegador (073), el único lado que puede guardar
 * la cookie nueva: el servidor la lee sin renovar (ver `leerSesion`).
 *
 * Pide `/api/auth/get-session`. Better Auth decide ahí si toca renovar (una
 * vez al día): si toca, alarga la sesión en la base y responde con un
 * `Set-Cookie` de 7 días más; si no, solo lee, y es barato.
 *
 * Al montar, al volver a la pestaña y cada hora: quien deja el CRM abierto
 * días enteros tampoco se queda fuera.
 */
export function SessionKeepalive(): null {
  useEffect(() => {
    let vivo = true;
    const renovar = () => {
      if (!vivo) return;
      // Un fallo de red aquí no importa: se reintenta en la siguiente vuelta.
      authClient.getSession().catch(() => {});
    };
    const alVolver = () => {
      if (document.visibilityState === "visible") renovar();
    };
    renovar();
    const intervalo = window.setInterval(renovar, CADA_MS);
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      vivo = false;
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, []);
  return null;
}
