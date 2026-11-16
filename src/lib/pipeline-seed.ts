import type { Locale } from "./i18n/locale";

export type SeedStage = { name: string; kind: "open" | "won" | "lost" };
export function initialPipelineStages(locale: Locale): SeedStage[] {
  const names = locale === "pt-BR"
    ? ["Novo", "Em conversa", "Interessado", "Cliente", "Perdido"]
    : ["Nuevo", "En conversación", "Interesado", "Cliente", "Perdido"];
  return names.map((name, i) => ({ name, kind: i === 3 ? "won" : i === 4 ? "lost" : "open" }));
}
