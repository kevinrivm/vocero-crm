"use client";

import { systemText } from "@/lib/i18n";

import { useI18n } from "@/components/i18n-provider";

import { useState } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import type { StageDto } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Gestión de etapas: renombrar, reordenar, agregar, eliminar (con reasignación). */
export function StageManager({
  stages,
  onClose,
  onChanged,
}: {
  stages: StageDto[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t: tr } = useI18n();

  const [newName, setNewName] = useState("");
  const [deleting, setDeleting] = useState<StageDto | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function rename(stage: StageDto, name: string) {
    if (!name.trim() || name === stage.name) return;
    await fetch(`/api/pipeline/stages/${stage.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    }).catch(() => null);
    onChanged();
  }

  async function move(stage: StageDto, dir: -1 | 1) {
    const sorted = [...stages].sort((a, b) => a.position - b.position);
    const idx = sorted.findIndex((s) => s.id === stage.id);
    const swap = sorted[idx + dir];
    if (!swap) return;
    await Promise.all([
      fetch(`/api/pipeline/stages/${stage.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ position: swap.position }),
      }),
      fetch(`/api/pipeline/stages/${swap.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ position: stage.position }),
      }),
    ]).catch(() => null);
    onChanged();
  }

  async function add() {
    if (!newName.trim()) return;
    await fetch("/api/pipeline/stages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    }).catch(() => null);
    setNewName("");
    onChanged();
  }

  async function remove(stage: StageDto, moveToId: string | null) {
    setError(null);
    const url = moveToId
      ? `/api/pipeline/stages/${stage.id}?moveTo=${moveToId}`
      : `/api/pipeline/stages/${stage.id}`;
    const res = await fetch(url, { method: "DELETE" }).catch(() => null);
    if (!res) return;
    if (res.status === 409) {
      const data = (await res.json().catch(() => null)) as {
        error?: { code?: string; message?: string };
      } | null;
      if (data?.error?.code === "stage_has_leads") {
        setDeleting(stage);
        return;
      }
      setError(data?.error?.message ?? tr("No se pudo eliminar"));
      return;
    }
    setDeleting(null);
    setMoveTo("");
    onChanged();
  }

  const sorted = [...stages].sort((a, b) => a.position - b.position);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-overlay p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-lg border bg-popover p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 font-semibold">{tr("Etapas del pipeline")}</h3>
        <ul className="space-y-2">
          {sorted.map((s, i) => (
            <li key={s.id} className="flex items-center gap-2">
              <Input
                defaultValue={s.name}
                onBlur={(e) => void rename(s, e.target.value)}
                className="flex-1"
              />
              {s.kind !== "open" ? (
                <Badge variant={s.kind === "won" ? "success" : "secondary"}>
                  {s.kind === "won" ? "ganado" : "perdido"}
                </Badge>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={tr("Eliminar etapa")}
                  onClick={() => void remove(s, null)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                disabled={i === 0}
                aria-label={tr("Subir")}
                onClick={() => void move(s, -1)}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={i === sorted.length - 1}
                aria-label={tr("Bajar")}
                onClick={() => void move(s, 1)}
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>

        {deleting && (
          <div className="mt-4 rounded-md border border-warning-soft bg-warning-tint p-3">
            <p className="text-sm text-warning-text">
              {tr("\"")}{deleting.name}{tr("\" tiene tarjetas. Elige a dónde moverlas:")}</p>
            <div className="mt-2 flex gap-2">
              <select
                value={moveTo}
                onChange={(e) => setMoveTo(e.target.value)}
                className="h-9 flex-1 rounded-md border border-input bg-card px-3 text-sm"
              >
                <option value="">{tr("Etapa destino…")}</option>
                {sorted
                  .filter((s) => s.id !== deleting.id)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
              <Button
                variant="destructive"
                size="sm"
                disabled={!moveTo}
                onClick={() => void remove(deleting, moveTo)}
              >
                {tr("Mover y eliminar")}</Button>
            </div>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-destructive">{systemText(tr.locale, error)}</p>}

        <div className="mt-4 flex gap-2 border-t pt-4">
          <Input
            placeholder={tr("Nueva etapa…")}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void add();
            }}
          />
          <Button onClick={() => void add()} disabled={!newName.trim()}>
            {tr("Agregar")}</Button>
        </div>

        <div className="mt-4 flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            {tr("Cerrar")}</Button>
        </div>
      </div>
    </div>
  );
}
