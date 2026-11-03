import Image from "next/image";
import type { Branding } from "@/lib/branding";
import { isVoceroName, BRAND_MARK_BODY, BRAND_MARK_TAIL } from "@/lib/brand";
import { faviconHref, faviconInitial } from "@/lib/favicon";
import { cn } from "@/lib/utils";

/**
 * Lo que la marca necesita para dibujarse: el nombre, el acento y si hay
 * logo subido (el acento entra en la URL versionada del icono generado).
 */
export type BrandingMark = Pick<Branding, "name" | "accent" | "favicon">;

/**
 * Componente oficial de Logo de Nexia con proporciones fijas (width: 120, height: 40)
 * y atributo alt="Nexia" estático.
 */
export function LogoNexia({
  width = 120,
  height = 40,
  className,
  priority = true,
}: {
  width?: number;
  height?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <div
      style={{ width, height }}
      className={cn("flex items-center gap-2.5 select-none shrink-0", className)}
    >
      <Image
        src="/logo.svg"
        alt="Nexia"
        width={width}
        height={height}
        priority={priority}
        className="h-full w-auto object-contain drop-shadow-sm"
      />
    </div>
  );
}

/**
 * El logo oficial estático de Nexia (/logo.svg con fallback a /logo.png).
 */
export function BrandMark({
  className,
}: {
  className?: string;
  cyan?: string;
}) {
  return (
    <Image
      src="/logo.svg"
      alt="Nexia"
      width={120}
      height={40}
      priority
      className={cn("h-10 w-auto object-contain drop-shadow-md", className)}
    />
  );
}

/**
 * Mosaico cuadrado: lleva el isotipo de Nexia o el logo subido.
 */
export function BrandTile({
  branding,
  className,
}: {
  branding: BrandingMark;
  className?: string;
}) {
  const isNexia = isVoceroName(branding.name);
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden",
        isNexia
          ? "bg-transparent shadow-none border-0"
          : "brand-tile bg-white/20 dark:bg-white/10 shadow-sm border border-white/20 text-foreground",
        className
      )}
      aria-hidden
    >
      {branding.favicon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={faviconHref(branding)}
          alt=""
          className="h-full w-full object-contain"
        />
      ) : isNexia ? (
        <BrandMark className="h-full w-full" />
      ) : (
        <span className="font-bold leading-none">{faviconInitial(branding.name)}</span>
      )}
    </span>
  );
}

const WORDMARK_SIZE = {
  md: "text-[21px]",
  lg: "text-[30px]",
} as const;

const MARK_SIZE = {
  md: "h-[24px] w-[24px]",
  lg: "h-[34px] w-[34px]",
} as const;

const TILE_SIZE = {
  md: "h-[30px] w-[30px] rounded-[9px] text-[15px]",
  lg: "h-[44px] w-[44px] rounded-[13px] text-[22px]",
} as const;

/**
 * La marca completa, como en la cabecera de la landing: trazo + wordmark
 * "vocero" en minúsculas y bien apretado. Una instancia rebautizada ve en su
 * lugar el mosaico con la inicial y su nombre (white-label). Con logo subido
 * gana el logo, se llame como se llame: quien sube un archivo quiere verlo.
 */
export function BrandLogo({
  branding,
  size = "md",
  className,
}: {
  branding: BrandingMark;
  size?: keyof typeof WORDMARK_SIZE;
  className?: string;
}) {
  if (isVoceroName(branding.name) && !branding.favicon) {
    return (
      <span className={cn("flex items-center gap-2.5 text-foreground", className)}>
        <BrandMark className={cn("shrink-0", MARK_SIZE[size])} />
        <span
          className={cn(
            "font-[850] leading-none tracking-[-0.04em] bg-gradient-to-r from-[#0F4C5C] to-[#3E2723] bg-clip-text text-transparent",
            WORDMARK_SIZE[size]
          )}
        >
          Nexia
        </span>
      </span>
    );
  }
  return (
    <span className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <BrandTile branding={branding} className={TILE_SIZE[size]} />
      <span
        className={cn(
          "truncate font-[750] leading-none tracking-tight",
          size === "lg" ? "text-[26px]" : "text-[17px]"
        )}
      >
        {branding.name}
      </span>
    </span>
  );
}
