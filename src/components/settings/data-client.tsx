"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Tus datos son tuyos: descarga completa del negocio en un JSON. Sin
 * credenciales y sin las conversaciones de prueba del Laboratorio.
 */
export function DataClient() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/export");
      if (!res.ok) {
        setError("No se pudo generar el export. Revisa los logs del servidor.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vocero-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("No se pudo generar el export. Revisa los logs del servidor.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Exportar tus datos</CardTitle>
          <CardDescription>
            Descarga un JSON con TODO lo de tu negocio: contactos, leads con su
            etapa, conversaciones completas con sus mensajes, citas y corridas
            del Laboratorio. Sin credenciales de WhatsApp u otros conectores
            (esos secretos no salen del servidor) y sin las conversaciones de
            prueba.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={download} disabled={busy}>
            <Download className="mr-2 size-4" />
            {busy ? "Generando…" : "Descargar export (JSON)"}
          </Button>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <p className="text-xs text-muted-foreground">
            El archivo se genera al vuelo con los datos de este momento.
            Guárdalo en un lugar seguro: contiene el historial completo de tus
            conversaciones.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
