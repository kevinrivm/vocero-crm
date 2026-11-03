import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Locale } from "@/lib/i18n/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Iniciales (máx 2) para el avatar de un contacto. */
export function initials(name: string): string {
  // 028 — La primera letra o cifra de cada palabra. Los nombres de Instagram y
  // Facebook traen emojis («Kevin Belier 🐏», «Vivir con virtud ⚖️»): tomar el
  // primer carácter partía el emoji a la mitad («K�») o lo usaba de inicial.
  const parts = name
    .trim()
    .split(/\s+/)
    .map((w) => w.match(/[\p{L}\p{N}]/u)?.[0])
    .filter((c): c is string => Boolean(c));
  if (parts.length === 0) return "?";
  const first = parts[0] ?? "";
  const second = parts.length > 1 ? (parts[parts.length - 1] ?? "") : "";
  return (first + second).toUpperCase();
}

/* Paleta de los avatares del mockup de la landing (hsl(h 62% 52%)): tonos
   medios saturados, legibles con inicial blanca en los dos temas. */
const AVATAR_COLORS = [
  "bg-[#3985d1]", // azul
  "bg-[#d17139]", // terracota
  "bg-[#9e39d1]", // violeta
  "bg-[#30a657]", // verde
  "bg-[#ce3b6c]", // frambuesa
  "bg-[#b67c20]", // ámbar
  "bg-[#30a6a6]", // turquesa
  "bg-[#6954d4]", // índigo
] as const;

/** Color estable por contacto: hash simple del id/teléfono → misma clase siempre. */
export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length] ?? AVATAR_COLORS[0];
}

export function formatBrazilianPhone(phone: string): string {
  // Solo dígitos canónicos o puntuación telefónica usual; las letras y las
  // identidades como `ig:5511...` nunca se convierten en teléfono.
  if (!/^\+?[\d\s().-]+$/.test(phone)) return phone;
  const digits = phone.replace(/\D/g, "");
  const match = /^55([1-9]\d)(\d{8,9})$/.exec(digits);
  if (!match) return phone;
  const ddd = match[1]!;
  const subscriber = match[2]!;
  const local = subscriber.length === 9
    ? `${subscriber.slice(0, 5)}-${subscriber.slice(5)}`
    : `${subscriber.slice(0, 4)}-${subscriber.slice(4)}`;
  return `+55 (${ddd}) ${local}`;
}

export function formatPhone(phone: string | null | undefined, locale: Locale = "es"): string {
  // 003: contactos BSUID pueden no tener teléfono.
  if (!phone) return locale === "pt-BR" ? "Sem telefone" : "Sin teléfono";
  if (!/^\+?[\d\s().-]+$/.test(phone)) return phone;
  const formatted = locale === "pt-BR" ? formatBrazilianPhone(phone) : phone;
  return formatted.startsWith("+") ? formatted : `+${formatted}`;
}
