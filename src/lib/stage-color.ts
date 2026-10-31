export type StageKind = "open" | "won" | "lost";
const COLORS = ["var(--accent)", "var(--warning)", "var(--text-3)", "var(--success)", "var(--danger)"] as const;
function normalized(name: string): string { return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR"); }
export function stageColor(name: string | null, kind?: StageKind | null): string {
  if (kind === "won") return "var(--success)";
  if (kind === "lost") return "var(--danger)";
  const key = normalized(name ?? "");
  if (["nuevo", "novo"].includes(key)) return "var(--text-3)";
  if (["en conversacion", "em conversa"].includes(key)) return "var(--accent)";
  if (["interesado", "interessado"].includes(key)) return "var(--warning)";
  if (["cliente"].includes(key)) return "var(--success)";
  if (["perdido", "perdida"].includes(key)) return "var(--danger)";
  let hash=0; for (const char of key) hash=(hash*31+char.charCodeAt(0))|0;
  return COLORS[Math.abs(hash) % COLORS.length]!;
}
