"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Palette,
  Upload,
  Image as ImageIcon,
  Trash2,
  Check,
  RotateCcw,
  Sparkles,
  Layers,
  Inbox,
  Users,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Branding } from "@/lib/branding";

function to6Hex(hex?: string | null, fallback = "#0F4C5C"): string {
  if (!hex) return fallback;
  let clean = hex.trim();
  if (!clean.startsWith("#")) clean = `#${clean}`;
  if (clean.length === 4) {
    clean = `#${clean[1]}${clean[1]}${clean[2]}${clean[2]}${clean[3]}${clean[3]}`;
  }
  return clean.slice(0, 7);
}

interface AppearanceClientProps {
  initialData: {
    name: string;
    logoUrl: string | null;
    primaryColor: string | null;
    sidebarColor: string | null;
  };
}

const PRIMARY_COLOR_PRESETS = [
  { name: "Nexia Cyan", hex: "#0F4C5C" },
  { name: "Royal Navy", hex: "#113264" },
  { name: "Indigo Modern", hex: "#4F46E5" },
  { name: "Esmeralda", hex: "#059669" },
  { name: "Púrpura Imperial", hex: "#7C3AED" },
  { name: "Carbón Neutro", hex: "#1E293B" },
  { name: "Vino Tinto", hex: "#881337" },
  { name: "Azul Eléctrico", hex: "#0284C7" },
];

const SIDEBAR_COLOR_PRESETS = [
  { name: "Glassmorphism (Predeterminado)", hex: "" },
  { name: "Noche Profunda", hex: "#0B132B" },
  { name: "Marino Ejecutante", hex: "#111827" },
  { name: "Pizarra Azulada", hex: "#0F172A" },
  { name: "Gris Carbón", hex: "#18181B" },
  { name: "Blanco Escarcha", hex: "#F8FAFC" },
];

export function AppearanceClient({ initialData }: AppearanceClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Estados del Formulario
  const [name, setName] = useState(initialData.name || "");
  const [logoUrl, setLogoUrl] = useState<string | null>(initialData.logoUrl || null);
  const [primaryColor, setPrimaryColor] = useState<string>(initialData.primaryColor || "#0F4C5C");
  const [sidebarColor, setSidebarColor] = useState<string>(initialData.sidebarColor || "");

  // Subida de Archivos
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Notificaciones
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Subida de logo al servidor
  const handleFileUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setFeedback({ type: "error", message: "Selecciona un archivo de imagen válido (PNG, JPEG, SVG, WebP)." });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setFeedback({ type: "error", message: "La imagen no puede exceder 5 MB." });
      return;
    }

    setIsUploading(true);
    setFeedback(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/tenant/upload-logo", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || data.message || "Error al subir el logo");
      }

      setLogoUrl(data.logoUrl);
      setFeedback({ type: "success", message: "¡Logo subido con éxito!" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error al procesar el archivo";
      setFeedback({ type: "error", message });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      void handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleUrlSubmit = () => {
    if (!urlInput.trim()) return;
    try {
      new URL(urlInput.trim());
      setLogoUrl(urlInput.trim());
      setUrlInput("");
      setFeedback({ type: "success", message: "Logo vinculado desde URL" });
    } catch {
      setFeedback({ type: "error", message: "Ingresa una URL válida que empiece por https://" });
    }
  };

  // Guardar configuración completa
  const handleSave = async () => {
    setFeedback(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/tenant/appearance", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim() || undefined,
            logoUrl: logoUrl || null,
            primaryColor: primaryColor ? primaryColor.trim() : null,
            sidebarColor: sidebarColor ? sidebarColor.trim() : null,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error?.message || "Error al guardar la configuración");
        }

        setFeedback({
          type: "success",
          message: "Marca y apariencia actualizadas correctamente. Los cambios ya son visibles en toda tu plataforma.",
        });
        router.refresh();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Ocurrió un error inesperado";
        setFeedback({ type: "error", message });
      }
    });
  };

  // Restaurar por defecto
  const handleReset = () => {
    setName(initialData.name);
    setLogoUrl(null);
    setPrimaryColor("#0F4C5C");
    setSidebarColor("");
    setFeedback(null);
  };

  return (
    <div className="flex-1 w-full overflow-y-auto p-4 sm:p-6 lg:p-8 pb-20 sm:pb-28">
      <div className="mx-auto max-w-6xl space-y-8">
        {/* Encabezado Principal */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-6">
          <div className="flex items-center gap-3">
            <span
              style={{ backgroundColor: primaryColor || "#0F4C5C" }}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg ring-1 ring-white/20 transition-colors duration-300"
            >
              <Palette className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Marca y Apariencia
              </h1>
              <p className="text-sm text-muted-foreground">
                Personaliza la identidad visual de tu empresa: sube tu logo y define los colores corporativos.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleReset}
              disabled={isPending || isUploading}
              className="rounded-2xl"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Restablecer
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={isPending || isUploading}
              style={{ backgroundColor: primaryColor || "#0F4C5C" }}
              className="rounded-2xl font-semibold text-white shadow-md transition-all active:scale-95 hover:opacity-90"
            >
              <Check className="h-4 w-4 mr-2" />
              {isPending ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </div>
        </div>

        {/* Notificación de Feedback */}
        {feedback && (
          <div
            className={cn(
              "flex items-center gap-3 p-4 rounded-2xl border transition-all",
              feedback.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
                : "bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-300"
            )}
          >
            {feedback.type === "success" ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertCircle className="h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" />
            )}
            <p className="text-sm font-medium">{feedback.message}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Columna Izquierda: Controles de Configuración */}
          <div className="lg:col-span-7 space-y-6">
            {/* Tarjeta: Nombre de la Empresa */}
            <div className="rounded-3xl border border-white/60 dark:border-white/10 bg-white/70 dark:bg-slate-900/70 p-6 shadow-md backdrop-blur-xl space-y-4">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-muted-foreground" />
                Nombre de la Empresa
              </h2>
              <p className="text-xs text-muted-foreground">
                Se mostrará en la barra lateral, en la pestaña del navegador y en los encabezados.
              </p>
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Mi Empresa S.A.S."
                className="rounded-xl border-slate-300 dark:border-slate-700 h-11"
              />
            </div>

            {/* Tarjeta: Logo de la Empresa */}
            <div className="rounded-3xl border border-white/60 dark:border-white/10 bg-white/70 dark:bg-slate-900/70 p-6 shadow-md backdrop-blur-xl space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                    Logo Corporativo
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Reemplazará el isotipo por defecto en la cabecera del menú lateral.
                  </p>
                </div>
                {logoUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setLogoUrl(null)}
                    className="text-destructive hover:bg-destructive/10 rounded-xl"
                  >
                    <Trash2 className="h-4 w-4 mr-1.5" />
                    Quitar Logo
                  </Button>
                )}
              </div>

              {/* Zona de Arrastrar y Soltar / Subir */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "relative flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-200",
                  isDragging
                    ? "border-primary bg-primary/5 scale-[1.01]"
                    : "border-slate-300 dark:border-slate-700 hover:border-slate-400 hover:bg-white/40 dark:hover:bg-slate-800/40"
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      void handleFileUpload(e.target.files[0]);
                    }
                  }}
                />

                {logoUrl ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-20 w-20 rounded-2xl bg-white/80 dark:bg-slate-800 p-2 shadow-inner border flex items-center justify-center overflow-hidden">
                      <img
                        src={logoUrl}
                        alt="Logo de la empresa"
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                    <p className="text-xs font-semibold text-foreground">
                      Haz clic o arrastra para reemplazar el logo
                    </p>
                    <span className="text-[11px] text-muted-foreground">
                      PNG, JPG, WebP o SVG (máx. 5 MB)
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center text-center gap-2">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500">
                      <Upload className="h-6 w-6" />
                    </span>
                    <p className="text-sm font-semibold text-foreground">
                      {isUploading ? "Subiendo imagen..." : "Arrastra tu logo aquí o haz clic para explorar"}
                    </p>
                    <span className="text-xs text-muted-foreground">
                      Formatos recomendados: PNG o SVG transparente · Máx 5 MB
                    </span>
                  </div>
                )}
              </div>

              {/* Opción de vincular por URL */}
              <div className="space-y-1.5 pt-1">
                <label className="text-xs font-medium text-muted-foreground">
                  O vincular directamente desde una URL externa:
                </label>
                <div className="flex gap-2">
                  <Input
                    type="url"
                    placeholder="https://ejemplo.com/logo.png"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    className="rounded-xl h-10 text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleUrlSubmit}
                    disabled={!urlInput.trim()}
                    className="rounded-xl shrink-0"
                  >
                    Vincular
                  </Button>
                </div>
              </div>
            </div>

            {/* Tarjeta: Colores Corporativos */}
            <div className="rounded-3xl border border-white/60 dark:border-white/10 bg-white/70 dark:bg-slate-900/70 p-6 shadow-md backdrop-blur-xl space-y-6">
              <div>
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Palette className="h-5 w-5 text-muted-foreground" />
                  Colores Corporativos
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Define los tonos que vestirán los botones principales, elementos activos y el menú lateral.
                </p>
              </div>

              {/* Selector 1: Color Primario */}
              <div className="space-y-3 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-semibold text-foreground">
                      Color Primario (Botones y Activos)
                    </span>
                    <p className="text-xs text-muted-foreground">
                      Aplica en botones de acción (+ Nuevo Agente, Guardar) y links activos.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={primaryColor || "#0F4C5C"}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="h-9 w-9 rounded-xl border border-slate-300 dark:border-slate-700 cursor-pointer overflow-hidden p-0"
                    />
                    <Input
                      type="text"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      placeholder="#0F4C5C"
                      className="w-28 font-mono text-xs uppercase h-9 rounded-xl"
                    />
                  </div>
                </div>

                {/* Presets de Color Primario */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {PRIMARY_COLOR_PRESETS.map((preset) => (
                    <button
                      key={preset.hex}
                      type="button"
                      onClick={() => setPrimaryColor(preset.hex)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all",
                        primaryColor.toLowerCase() === preset.hex.toLowerCase()
                          ? "ring-2 ring-primary border-primary bg-primary/10 font-bold"
                          : "border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
                      )}
                    >
                      <span
                        className="h-3.5 w-3.5 rounded-full shadow-sm ring-1 ring-black/10"
                        style={{ backgroundColor: preset.hex }}
                      />
                      <span>{preset.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Selector 2: Color de Barra Lateral */}
              <div className="space-y-3 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-semibold text-foreground">
                      Color del Menú Lateral (Sidebar)
                    </span>
                    <p className="text-xs text-muted-foreground">
                      Personaliza el fondo del menú de navegación. Déjalo vacío para Glassmorphism translúcido.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={sidebarColor || "#0B132B"}
                      onChange={(e) => setSidebarColor(e.target.value)}
                      className="h-9 w-9 rounded-xl border border-slate-300 dark:border-slate-700 cursor-pointer overflow-hidden p-0"
                    />
                    <Input
                      type="text"
                      value={sidebarColor}
                      onChange={(e) => setSidebarColor(e.target.value)}
                      placeholder="Vacío = Auto"
                      className="w-28 font-mono text-xs uppercase h-9 rounded-xl"
                    />
                  </div>
                </div>

                {/* Presets de Barra Lateral */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {SIDEBAR_COLOR_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => setSidebarColor(preset.hex)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all",
                        sidebarColor.toLowerCase() === preset.hex.toLowerCase()
                          ? "ring-2 ring-primary border-primary bg-primary/10 font-bold"
                          : "border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
                      )}
                    >
                      {preset.hex ? (
                        <span
                          className="h-3.5 w-3.5 rounded-full shadow-sm ring-1 ring-black/10"
                          style={{ backgroundColor: preset.hex }}
                        />
                      ) : (
                        <span className="h-3.5 w-3.5 rounded-full border border-dashed border-slate-400" />
                      )}
                      <span>{preset.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Columna Derecha: Vista Previa en Vivo */}
          <div className="lg:col-span-5 space-y-6">
            <div className="sticky top-6 rounded-3xl border border-white/60 dark:border-white/10 bg-white/70 dark:bg-slate-900/70 p-6 shadow-xl backdrop-blur-xl space-y-6">
              <div className="flex items-center justify-between border-b pb-4">
                <div className="flex items-center gap-2">
                  <Layers className="h-5 w-5 text-muted-foreground" />
                  <h3 className="font-bold text-foreground">Vista Previa en Vivo</h3>
                </div>
                <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                  Tiempo Real
                </span>
              </div>

              {/* Mockup de Navegación Lateral */}
              <div className="relative rounded-2xl overflow-hidden p-4 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-950 dark:to-slate-900 border border-slate-200 dark:border-slate-800 shadow-inner">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Barra Lateral del Tenant
                </p>

                <div
                  style={{
                    backgroundImage: `linear-gradient(to bottom, ${to6Hex(sidebarColor, "#0B132B")}1A, ${to6Hex(primaryColor, "#0F4C5C")}0D)`,
                  }}
                  className="relative rounded-2xl p-3 bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl border border-white/50 dark:border-white/10 shadow-sm space-y-4 overflow-hidden transition-all duration-300"
                >

                  {/* Cabecera del Sidebar con Logo */}
                  <div className="relative z-10 flex items-center gap-2.5 px-1 py-1">
                    <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/50 border shadow-sm overflow-hidden">
                      {logoUrl ? (
                        <img
                          src={logoUrl}
                          alt="Preview logo"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span
                          style={{
                            backgroundColor: `${(primaryColor || "#0F4C5C").slice(0, 7)}1A`,
                            color: (primaryColor || "#0F4C5C").slice(0, 7),
                          }}
                          className="flex h-full w-full items-center justify-center font-bold text-sm"
                        >
                          {name ? name.slice(0, 2).toUpperCase() : "EM"}
                        </span>
                      )}
                      <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-foreground truncate">
                        {name || "Tu Empresa"}
                      </p>
                      <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-emerald-700 dark:text-emerald-400">
                        <span className="h-1 w-1 rounded-full bg-emerald-500 animate-pulse" />
                        Conectado
                      </span>
                    </div>
                  </div>

                  {/* Items de Navegación Mockup con pastilla activa suave */}
                  <div className="relative z-10 space-y-1">
                    <div
                      style={{
                        backgroundColor: `${(primaryColor || "#0F4C5C").slice(0, 7)}1A`,
                        color: (primaryColor || "#0F4C5C").slice(0, 7),
                      }}
                      className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl font-semibold text-xs shadow-sm transition-colors duration-300"
                    >
                      <Inbox className="h-4 w-4" />
                      <span>Bandeja de Entrada</span>
                    </div>

                    <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 text-xs font-medium">
                      <Users className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                      <span>Base de Contactos</span>
                    </div>

                    <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 text-xs font-medium">
                      <ShieldCheck className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                      <span>Equipo de Trabajo</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Mockup de Botones Primarios de la UI */}
              <div className="space-y-3">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Botones y Acciones en Pantalla
                </p>

                <div className="p-4 rounded-2xl bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium text-foreground">
                      Botón de Alta (+ Nuevo Agente):
                    </span>
                    <button
                      type="button"
                      style={{ backgroundColor: primaryColor || "#0F4C5C" }}
                      className="px-3.5 py-1.5 rounded-xl font-semibold text-white text-xs shadow-md transition-all hover:opacity-90 active:scale-95"
                    >
                      + Nuevo Agente
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-2 border-t">
                    <span className="text-xs font-medium text-foreground">
                      Botón de Guardar en Formularios:
                    </span>
                    <button
                      type="button"
                      style={{ backgroundColor: primaryColor || "#0F4C5C" }}
                      className="px-3.5 py-1.5 rounded-xl font-semibold text-white text-xs shadow-md transition-all hover:opacity-90 active:scale-95"
                    >
                      Guardar Cambios
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

