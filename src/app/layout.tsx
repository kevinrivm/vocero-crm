import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono, IBM_Plex_Sans, Instrument_Serif, Inter, Urbanist } from "next/font/google";
import { accentCssVariables, DEFAULT_BRANDING } from "@/lib/branding";
import { appIconHref, NAV_INK, shortAppName } from "@/lib/pwa";
import { RegistrarServiceWorker } from "@/components/pwa";
import { atributosHtml, cssDePropio, cssDeTemas } from "@/lib/temas";
import { aparienciaActual } from "@/server/apariencia";
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
// 062 — Las otras dos letras que se eligen en Ajustes → Apariencia.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
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

export const metadata: Metadata = {
  title: "Nexia",
  description: "El CRM inteligente con Agente IA",
};

/** 048 — La barra de estado de la app instalada, del color de la barra lateral. */
export const viewport: Viewport = { themeColor: NAV_INK };

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const branding = await getBranding().catch(() => DEFAULT_BRANDING);
  // 062 · D6 — La apariencia (tema, letra, tamaño y densidad) se resuelve en
  // el servidor: el primer pintado ya la trae, sin parpadeo.
  const { apariencia } = await aparienciaActual().catch(() => ({
    apariencia: { tema: "menta", letra: "urbanist", tamano: "normal", densidad: "normal" } as const,
  }));
  return (
    <html
      lang="es"
      className={`${urbanist.variable} ${archivo.variable} ${inter.variable} ${plexSans.variable} ${instrumentSerif.variable} ${plexMono.variable}`}
      // La preferencia siempre es explícita: viaja resuelta en el HTML del
      // servidor, así que no hay divergencia con el cliente ni parpadeo.
      {...atributosHtml(apariencia)}
    >
      <head>
        {/* Acento white-label inyectado en SSR: sin flash de tema */}
        <style
          dangerouslySetInnerHTML={{ __html: accentCssVariables(branding.accent) }}
        />
        {/* 062 — Los temas listos (todos, para cambiar en vivo) y el propio. */}
        <style
          id="vocero-temas"
          dangerouslySetInnerHTML={{ __html: cssDeTemas() + cssDePropio(apariencia) }}
        />
      </head>
      <body className="font-sans">
        {children}
        <RegistrarServiceWorker />
      </body>
    </html>
  );
}
