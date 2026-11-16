"use client";

import { systemText } from "@/lib/i18n";

import { useI18n } from "@/components/i18n-provider";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Inbox } from "lucide-react";
import {
  ACCENT_PRESETS,
  DEFAULT_BRANDING,
  isValidHex,
  resolveAccentSet,
  resolveNavAccentSet,
  type AccentSet,
  type Branding,
} from "@/lib/branding";
import {
  CURRENCY_GROUPS,
  CURRENCY_OPTIONS,
  DEFAULT_CURRENCY,
  type Currency,
} from "@/lib/money";
import { cn } from "@/lib/utils";
import { LOCALES, LOCALE_NAMES, type Locale } from "@/lib/i18n/locale";
import { useResolvedTheme } from "@/components/use-theme";
import { BrandLogo } from "@/components/brand-mark";
import { navItemClass } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Los tokens del acento, para sobreescribirlos SOLO dentro de una caja. */
function accentVars(s: AccentSet): React.CSSProperties {
  return {
    "--accent": s.accent,
    "--accent-hover": s.hover,
    "--accent-soft": s.soft,
    "--accent-tint": s.tint,
    "--accent-text": s.text,
    "--accent-fg": s.fg,
  } as React.CSSProperties;
}

export function BrandingClient({
  favicon = null,
  kicker = "CRM · WhatsApp",
}: {
  /** 028 — La etiqueta bajo el logo, la misma que enseña el menú. */
  kicker?: string;
  /**
   * Logo subido, solo para la vista previa: se sube y se quita en su propia
   * tarjeta. Llega del servidor y no del fetch de abajo a propósito: esa
   * tarjeta hace `router.refresh()` al subir o quitar, la página vuelve a
   * pasar la prop y la vista previa cambia sin recargar. Leído una sola vez
   * al montar, se quedaría con el logo de antes.
   */
  favicon?: Branding["favicon"];
}) {
  const { t: tr } = useI18n();

  const router = useRouter();
  const mode = useResolvedTheme();
  const [locale, setLocale] = useState<Locale>("es");
  const [name, setName] = useState("");
  const [accent, setAccent] = useState<string>(DEFAULT_BRANDING.accent);
  const [currency, setCurrency] = useState<Currency>(DEFAULT_CURRENCY);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings/branding")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { branding: Branding } | null) => {
        if (d) {
          setName(d.branding.name);
          setLocale(d.branding.locale ?? "es");
          setAccent(d.branding.accent);
          if (d.branding.currency) setCurrency(d.branding.currency);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const isPreset = accent.toLowerCase() in ACCENT_PRESETS;
  // La vista previa muestra el acento tal como se verá en el tema activo: los
  // presets están pensados para fondo claro y en oscuro se aclaran. La barra
  // lateral es azul marino en los dos temas y lleva su propio cálculo.
  const previewSet = resolveAccentSet(accent, mode);
  const navSet = resolveNavAccentSet(accent);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await fetch("/api/settings/branding", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name.trim(), accent, currency, locale }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? tr("No se pudo guardar"));
      return;
    }
    setSaved(true);
    // Re-renderiza el árbol server (layout raíz inyecta el acento y el título)
    router.refresh();
  }

  if (!loaded) return <p className="text-sm text-text-3">{tr("Cargando…")}</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{tr("Marca del CRM")}</CardTitle>
          <CardDescription>
            {tr("Este CRM es tuyo: ponle el nombre de tu negocio y tu color. Se reflejan en toda la interfaz y en la pantalla de inicio de sesión.")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="brand-locale">{tr("Idioma predeterminado")}</Label>
            <select id="brand-locale" value={locale}
              onChange={(e) => setLocale(e.target.value as Locale)}
              className="h-9 max-w-xs rounded-md border border-input bg-card px-2 text-sm">
              {LOCALES.map((code) => <option key={code} value={code}>{LOCALE_NAMES[code]}</option>)}
            </select>
            <p className="text-xs text-text-3">{tr("Cada persona puede elegir otro idioma en este navegador.")}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="brand-name">{tr("Nombre")}</Label>
            <Input
              id="brand-name"
              maxLength={30}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Vocero"
              className="max-w-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="brand-currency">{tr("Moneda del negocio")}</Label>
            <select
              id="brand-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as Currency)}
              className="h-9 max-w-xs rounded-md border border-input bg-card px-2 text-sm"
            >
              {CURRENCY_GROUPS.map((g) => (
                <optgroup key={g.id} label={systemText(tr.locale, g.label)}>
                  {CURRENCY_OPTIONS.filter((c) => c.group === g.id).map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} · {systemText(tr.locale, c.name)} ({systemText(tr.locale, c.where)})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <p className="text-xs text-text-3">
              {tr("Es la única que el Pipeline suma. Los montos capturados en otra moneda se muestran, pero quedan fuera del total de su columna.")}</p>
          </div>

          <div className="space-y-2">
            <Label>{tr("Color de acento")}</Label>
            <div className="flex flex-wrap items-center gap-2">
              {Object.entries(ACCENT_PRESETS).map(([hex, preset]) => (
                <button
                  key={hex}
                  onClick={() => setAccent(hex)}
                  title={systemText(tr.locale, preset.label)}
                  aria-label={systemText(tr.locale, preset.label)}
                  className={cn(
                    "flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                    accent.toLowerCase() === hex
                      ? "border-text-2 bg-secondary"
                      : "border-border-strong hover:bg-accent"
                  )}
                >
                  <span
                    className="h-4 w-4 rounded-full"
                    style={{ background: resolveAccentSet(hex, mode).accent }}
                  />
                  {systemText(tr.locale, preset.label)}
                </button>
              ))}
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                  !isPreset ? "border-text-2 bg-secondary" : "border-border-strong hover:bg-accent"
                )}
              >
                <input
                  type="color"
                  value={isValidHex(accent) ? accent : DEFAULT_BRANDING.accent}
                  onChange={(e) => setAccent(e.target.value)}
                  className="h-4 w-4 cursor-pointer appearance-none border-0 bg-transparent p-0"
                />
                {tr("Personalizado")}</label>
            </div>
            <p className="text-xs text-text-3">
              {tr("Con un color personalizado, los tonos derivados (hover, fondos suaves) se calculan solos y se ajusta el contraste.")}</p>
          </div>

          {/* Vista previa: el bicolor real en miniatura, con el color que se
              está eligiendo (aún sin guardar). A la izquierda la barra, con la
              misma clase (`nav-dark`) y el mismo renglón activo que la de
              verdad; a la derecha la página en el tema activo, con su botón. */}
          <div
            aria-label={tr("Vista previa de la marca")}
            className="flex flex-col overflow-hidden rounded-md border border-border-strong sm:flex-row"
          >
            <div
              className="nav-dark shrink-0 bg-subtle p-3 text-foreground sm:w-60"
              style={accentVars(navSet)}
            >
              <div className="px-2 pt-0.5">
                <BrandLogo
                  branding={{ name: name.trim() || DEFAULT_BRANDING.name, accent, favicon }}
                />
                <span className="kicker mt-2 block">{systemText(tr.locale, kicker)}</span>
              </div>
              <span className={cn(navItemClass(true), "mt-3")}>
                <Inbox className="h-[17px] w-[17px] text-brand" strokeWidth={1.8} />
                <span className="flex-1">{tr("Bandeja")}</span>
              </span>
            </div>
            <div
              className="flex flex-1 items-center justify-center border-t border-border-strong bg-background p-4 sm:border-l sm:border-t-0"
              style={accentVars(previewSet)}
            >
              <span className="rounded-full bg-brand px-3.5 py-1.5 text-xs font-semibold text-brand-fg shadow-sm">
                {tr("Botón de ejemplo")}</span>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{systemText(tr.locale, error)}</p>}
          {saved && <p className="text-sm" style={{ color: previewSet.text }}>{tr("Marca guardada ✓")}</p>}
          <Button disabled={saving || !name.trim()} onClick={() => void save()}>
            {saving ? tr("Guardando…") : tr("Guardar marca")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
