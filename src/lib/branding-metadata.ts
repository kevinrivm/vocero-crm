import { normalizeBranding, type Branding } from "@/lib/branding";
export function parseMetadata(metadata: string | null): Record<string, unknown> {
  if (!metadata) return {};
  try {
    const value: unknown = JSON.parse(metadata);
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown> : {};
  } catch { return {}; }
}
/** Extensión aditiva: conserva datos de integraciones y futuras opciones de marca. */
export function brandingMetadata(metadata: string | null, branding: Branding): string {
  const meta = parseMetadata(metadata);
  const previous = typeof meta.branding === "object" && meta.branding !== null && !Array.isArray(meta.branding) ? meta.branding : {};
  return JSON.stringify({ ...meta, branding: { ...previous, ...normalizeBranding(branding) } });
}
