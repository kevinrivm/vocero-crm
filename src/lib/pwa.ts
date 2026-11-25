import type { MetadataRoute } from "next";
import { faviconCacheKey } from "./favicon";
import type { Branding } from "./branding";

/**
 * 048 — Vocero instalable en el celular (PWA), con la marca de la
 * organización. Lo puro vive aquí para probarlo sin servidor: el manifest, los
 * tamaños de icono y sus URLs.
 */

/**
 * La tinta de la barra lateral (`--bg` de `.nav-dark` en
 * `globals.css`), igual en los dos temas. Es el color de la barra de estado y
 * de la pantalla de arranque de la app instalada: así se ve como la barra
 * lateral, no como un parche blanco antes de pintar.
 */
export const NAV_INK = "#0d181c";

/** 180 para el iPhone (`apple-touch-icon`); 192 y 512 los pide Chrome para instalar. */
export const APP_ICON_SIZES = [180, 192, 512] as const;
export type AppIconSize = (typeof APP_ICON_SIZES)[number];
export type AppIconPurpose = "any" | "maskable";

/** Pura: valida los parámetros del icono. `null` = 400. */
export function parseAppIconParams(
  params: URLSearchParams
): { size: AppIconSize; purpose: AppIconPurpose } | null {
  const size = Number(params.get("size"));
  if (!(APP_ICON_SIZES as readonly number[]).includes(size)) return null;
  const p = params.get("purpose") ?? "any";
  if (p !== "any" && p !== "maskable") return null;
  return { size: size as AppIconSize, purpose: p };
}

export function appIconHref(
  branding: Pick<Branding, "name" | "accent" | "favicon">,
  size: AppIconSize,
  purpose: AppIconPurpose = "any"
): string {
  const p = purpose === "maskable" ? "&purpose=maskable" : "";
  return `/api/branding/app-icon?size=${size}${p}&v=${faviconCacheKey(branding)}`;
}

/**
 * El nombre corto que se lee bajo el icono. Android corta a ~12 caracteres:
 * mejor la primera palabra entera que «Ferretería E…».
 */
export function shortAppName(name: string): string {
  const limpio = name.trim() || "CRM";
  if (limpio.length <= 12) return limpio;
  const primera = limpio.split(/\s+/)[0] ?? limpio;
  return primera.length <= 12 ? primera : primera.slice(0, 12);
}

/** Pura: el manifest de la instancia. Nada de «Vocero» cableado: sale de la marca. */
export function buildManifest(
  branding: Pick<Branding, "name" | "accent" | "favicon">,
  description: string
): MetadataRoute.Manifest {
  return {
    id: "/",
    name: branding.name,
    short_name: shortAppName(branding.name),
    description,
    lang: "es",
    dir: "ltr",
    // Quien abre la app instalada viene a contestar: directo a la Bandeja, no a
    // la guía de inicio (que sigue a un clic en el menú). `id` se queda en «/»
    // para que Chrome la reconozca como la misma app ya instalada.
    start_url: "/inbox",
    scope: "/",
    display: "standalone",
    background_color: NAV_INK,
    theme_color: NAV_INK,
    icons: [
      { src: appIconHref(branding, 192), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: appIconHref(branding, 512), sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: appIconHref(branding, 512, "maskable"),
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
