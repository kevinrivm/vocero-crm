"use client";

import { translator, type Translator } from "@/lib/i18n";

import { useI18n } from "@/components/i18n-provider";

import { useEffect, useState } from "react";
import type {
  AdsBlockDto,
  BotBlockDto,
  HygieneBlockDto,
  SalesBlockDto,
} from "@/lib/analytics";
import { AdsSection } from "./ads-section";
import { BotSection } from "./bot-section";
import { HygieneSection } from "./hygiene-section";
import { defaultRange, RangePicker, type Range } from "./range-picker";
import { SalesSection } from "./sales-section";

type Block<T> = { data: T | null; loading: boolean; error: string | null };

const inicial = <T,>(): Block<T> => ({ data: null, loading: true, error: null });

/**
 * Pide un bloque y lo deja en su estado. Mientras llega, CONSERVA lo anterior
 * (la sección lo atenúa): vaciar en cada cambio de rango haría saltar la
 * pantalla. Una respuesta que llega tarde, de un rango que ya no es el
 * elegido, se descarta con el `AbortSignal`.
 */
async function cargar<T>(
  url: string,
  set: (update: (prev: Block<T>) => Block<T>) => void,
  signal: AbortSignal, tr: Translator = translator("es")
): Promise<void> {
  set((prev) => ({ ...prev, loading: true, error: null }));
  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch {
    if (signal.aborted) return;
    set(() => ({ data: null, loading: false, error: tr("No se pudo cargar. Revisa tu conexión.") }));
    return;
  }
  const body = (await res.json().catch(() => null)) as
    | (T & { error?: { message?: string } })
    | null;
  if (signal.aborted) return;
  if (!res.ok || !body) {
    set(() => ({
      data: null,
      loading: false,
      error: body?.error?.message ?? tr("No se pudo calcular este bloque."),
    }));
    return;
  }
  set(() => ({ data: body, loading: false, error: null }));
}

/**
 * 019 — Pantalla Resultados.
 *
 * Cada bloque carga por su cuenta: son una veintena de consultas repartidas en
 * cuatro grupos, y en una sola respuesta el más lento retrasaría a los tres
 * rápidos. Así la pantalla pinta en cascada y un bloque roto muestra su propio
 * error sin tumbar el resto.
 */
export function ResultsClient({
  currency,
  agenda,
  today,
  timezone,
}: {
  currency: string;
  agenda: boolean;
  /** Hoy en la zona del negocio (`YYYY-MM-DD`), resuelto en el servidor. */
  today: string;
  timezone: string;
}) {
  const { t: tr } = useI18n();

  const [range, setRange] = useState<Range>(() => defaultRange(today));
  const [sales, setSales] = useState<Block<SalesBlockDto>>(inicial);
  const [ads, setAds] = useState<Block<AdsBlockDto>>(inicial);
  const [bot, setBot] = useState<Block<BotBlockDto>>(inicial);
  const [hygiene, setHygiene] = useState<Block<HygieneBlockDto>>(inicial);

  useEffect(() => {
    const ctl = new AbortController();
    const q = `from=${range.from}&to=${range.to}`;
    void cargar(`/api/analytics/sales?${q}`, setSales, ctl.signal, tr);
    void cargar(`/api/analytics/ads?${q}`, setAds, ctl.signal, tr);
    void cargar(`/api/analytics/bot?${q}`, setBot, ctl.signal, tr);
    return () => ctl.abort();
  }, [range, tr]);

  // La higiene describe el AHORA: no depende del rango elegido.
  useEffect(() => {
    const ctl = new AbortController();
    void cargar("/api/analytics/hygiene", setHygiene, ctl.signal, tr);
    return () => ctl.abort();
  }, [tr]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6 sm:py-4">
        <div className="min-w-0">
          <h2 className="text-[17px] font-bold tracking-tight">{tr("Resultados")}</h2>
          <p className="text-xs text-text-3">
            {tr("Ventas, el trabajo del agente, de dónde llegan y qué se está cayendo.")}</p>
        </div>
        <RangePicker value={range} onChange={setRange} today={today} timezone={timezone} />
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 sm:p-6">
        <SalesSection {...sales} currency={currency} />
        <AdsSection {...ads} />
        <BotSection {...bot} agenda={agenda} />
        <HygieneSection {...hygiene} currency={currency} />
      </div>
    </div>
  );
}
