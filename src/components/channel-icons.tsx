import React from "react";
import { cn } from "@/lib/utils";

const WHATSAPP_PATH =
  "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z";

const MESSENGER_PATH =
  "M12 0C5.24 0 0 4.952 0 11.64c0 3.499 1.434 6.521 3.769 8.61a.96.96 0 0 1 .323.683l.065 2.135a.96.96 0 0 0 1.347.85l2.381-1.053a.96.96 0 0 1 .641-.046A13 13 0 0 0 12 23.28c6.76 0 12-4.952 12-11.64S18.76 0 12 0m6.806 7.44c.522-.03.971.567.63 1.094l-4.178 6.457a.707.707 0 0 1-.977.208l-3.87-2.504a.44.44 0 0 0-.49.007l-4.363 3.01c-.637.438-1.415-.317-.995-.966l4.179-6.457a.706.706 0 0 1 .977-.21l3.87 2.505c.15.097.344.094.491-.007l4.362-3.008a.7.7 0 0 1 .364-.13";

const INSTAGRAM_PATH =
  "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z";

const TIKTOK_PATH =
  "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z";

/**
 * Logo oficial de WhatsApp
 */
export function WhatsAppIcon({
  className,
  colored = true,
}: {
  className?: string;
  colored?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("shrink-0", colored ? "text-[#25D366]" : "currentColor", className)}
    >
      <path fill="currentColor" d={WHATSAPP_PATH} />
    </svg>
  );
}

/**
 * Logo oficial de Messenger (Meta)
 */
export function MessengerIcon({
  className,
  colored = true,
}: {
  className?: string;
  colored?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      {colored ? (
        <>
          <defs>
            <linearGradient id="messenger-svg-grad" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#0099FF" />
              <stop offset="50%" stopColor="#A033FF" />
              <stop offset="100%" stopColor="#FF5280" />
            </linearGradient>
          </defs>
          <path fill="url(#messenger-svg-grad)" d={MESSENGER_PATH} />
        </>
      ) : (
        <path fill="currentColor" d={MESSENGER_PATH} />
      )}
    </svg>
  );
}

/**
 * Logo oficial de Instagram
 */
export function InstagramIcon({
  className,
  colored = true,
}: {
  className?: string;
  colored?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      {colored ? (
        <>
          <defs>
            <linearGradient id="instagram-svg-grad" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#F9CE34" />
              <stop offset="50%" stopColor="#EE2A7B" />
              <stop offset="100%" stopColor="#6228D7" />
            </linearGradient>
          </defs>
          <path fill="url(#instagram-svg-grad)" d={INSTAGRAM_PATH} />
        </>
      ) : (
        <path fill="currentColor" d={INSTAGRAM_PATH} />
      )}
    </svg>
  );
}

/**
 * Logo oficial de TikTok
 */
export function TikTokIcon({
  className,
  colored = true,
}: {
  className?: string;
  colored?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("shrink-0", colored ? "text-slate-900 dark:text-white" : "currentColor", className)}
    >
      <path fill="currentColor" d={TIKTOK_PATH} />
    </svg>
  );
}

/**
 * Renderizador unificado por canal
 */
export function ChannelBrandIcon({
  channel,
  className,
  colored = true,
}: {
  channel: string;
  className?: string;
  colored?: boolean;
}) {
  const c = channel.toLowerCase();
  if (c.includes("whatsapp")) {
    return <WhatsAppIcon className={className} colored={colored} />;
  }
  if (c.includes("messenger")) {
    return <MessengerIcon className={className} colored={colored} />;
  }
  if (c.includes("instagram")) {
    return <InstagramIcon className={className} colored={colored} />;
  }
  if (c.includes("tiktok")) {
    return <TikTokIcon className={className} colored={colored} />;
  }
  return <WhatsAppIcon className={className} colored={colored} />;
}

