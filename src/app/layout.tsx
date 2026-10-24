import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Archivo, IBM_Plex_Mono, Instrument_Serif, Urbanist } from "next/font/google";
import { accentCssVariables, DEFAULT_BRANDING } from "@/lib/branding";
import { faviconHref } from "@/lib/favicon";
import { appIconHref, NAV_INK, shortAppName } from "@/lib/pwa";
import { RegistrarServiceWorker } from "@/components/pwa";
import { normalizeThemePreference, THEME_COOKIE } from "@/lib/theme";
import { getBranding } from "@/server/branding";
import { enabledChannels } from "@/server/channels/enabled";
import { productName } from "@/lib/channels";
import "./globals.css";

// Las voces de la marca. next/font las descarga en BUILD y las sirve
// self-hosted (sin CDN en runtime: soberanía). 061 — La interfaz va en
// Urbanist (geométrica y ligera, como la referencia del diseño de tarjetas);
// Archivo, la de vocerocrm.com, queda cargada para elegirla (062).
// `--font-sans` se arma en globals.css a partir de estas.
const urbanist = Urbanist({
  subsets: ["latin"],
  variable: "--font-urbanist",
  display: "swap",
});
const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
});
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getBranding().catch(() => DEFAULT_BRANDING);
  const producto = productName([...enabledChannels()]);
  return {
    title: `${branding.name} — ${producto}`,
    description: `${producto} con agente de IA y Laboratorio de auto-evaluación`,
    // El `?v=` cambia con la marca: los navegadores guardan el favicon con una
    // insistencia notable y, sin eso, el logo nuevo tarda días en aparecer.
    icons: {
      icon: faviconHref(branding),
      // 048 — El icono de «Agregar a inicio» del iPhone: PNG de 180, a sangre.
      apple: appIconHref(branding, 180),
    },
    // 048 — Instalada desde Safari, abre sin la barra del navegador. Barra de
    // estado negra y no translúcida: la página no tiene margen para el notch.
    appleWebApp: { capable: true, title: shortAppName(branding.name), statusBarStyle: "black" },
  };
}

/** 048 — La barra de estado de la app instalada, del color de la barra lateral. */
export const viewport: Viewport = { themeColor: NAV_INK };

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const branding = await getBranding().catch(() => DEFAULT_BRANDING);
  const theme = normalizeThemePreference(
    (await cookies()).get(THEME_COOKIE)?.value
  );
  return (
    <html
      lang="es"
      className={`${urbanist.variable} ${archivo.variable} ${instrumentSerif.variable} ${plexMono.variable}`}
      // La preferencia siempre es explícita: el tema viaja resuelto en el HTML
      // del servidor, así que no hay divergencia con el cliente ni parpadeo.
      data-theme={theme}
    >
      <head>
        {/* Acento white-label inyectado en SSR: sin flash de tema */}
        <style
          dangerouslySetInnerHTML={{ __html: accentCssVariables(branding.accent) }}
        />
      </head>
      <body className="font-sans">
        {children}
        <RegistrarServiceWorker />
      </body>
    </html>
  );
}
