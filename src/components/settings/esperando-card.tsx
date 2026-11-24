"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  ETIQUETA_MODO_ESPERANDO,
  MODOS_ESPERANDO,
  type AvisoEsperandoDto,
} from "@/lib/esperando";
import { guardarAvisoEsperando, useCambiosDeAjuste } from "@/components/esperando/estado";

/**
 * 077 — Ajustes → Apariencia → «Clientes esperando»: qué ve ESTA persona del
 * aviso «Esperando a una persona» (el cintillo de arriba y el aviso de los 15
 * min) y si el aviso suena. Es de cada quien, como la apariencia: se guarda
 * al momento en su cookie y no cambia nada para el resto del equipo. La
 * pestaña «Esperando» de la Bandeja sigue ahí siempre.
 */
export function EsperandoCard({ inicial }: { inicial: AvisoEsperandoDto }) {
  const [datos, setDatos] = useState<AvisoEsperandoDto>(inicial);
  // El sonido también se cambia desde el cintillo: se sigue aquí sin recargar.
  useCambiosDeAjuste(setDatos);

  function guardar(cambio: Partial<AvisoEsperandoDto>) {
    const nuevo = { ...datos, ...cambio };
    setDatos(nuevo);
    guardarAvisoEsperando(nuevo);
  }

  return (
    <Card id="esperando" data-ajuste-esperando className="scroll-mt-20">
      <CardHeader>
        <CardTitle>Clientes esperando</CardTitle>
        <CardDescription>
          Qué ves dentro de la app cuando un cliente espera a una persona. Es solo para ti: el resto del
          equipo no cambia.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div role="radiogroup" aria-label="Qué ves cuando un cliente espera" className="space-y-2">
          {MODOS_ESPERANDO.map((modo) => {
            const elegido = datos.modo === modo;
            return (
              <button
                key={modo}
                type="button"
                role="radio"
                aria-checked={elegido}
                data-modo={modo}
                onClick={() => !elegido && guardar({ modo })}
                className={cn(
                  "flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  elegido ? "border-brand bg-brand-tint" : "border-border hover:border-border-strong"
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-0.5 h-4 w-4 shrink-0 rounded-full border-2",
                    elegido ? "border-brand bg-brand shadow-[inset_0_0_0_2px_var(--bg)]" : "border-border-strong"
                  )}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{ETIQUETA_MODO_ESPERANDO[modo].titulo}</span>
                  <span className="block text-xs text-text-3">{ETIQUETA_MODO_ESPERANDO[modo].cuando}</span>
                </span>
              </button>
            );
          })}
        </div>
        {datos.modo !== "nada" && (
          <div className="flex items-start justify-between gap-4 border-t pt-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">Sonido del aviso</p>
              <p className="text-xs text-text-3">Suena cuando un cliente pasa de 15 minutos esperando.</p>
            </div>
            <Switch
              size="sm"
              checked={datos.sonido}
              onCheckedChange={(v) => guardar({ sonido: v })}
              label="Sonido del aviso de clientes esperando"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
