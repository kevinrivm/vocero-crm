import { describe, expect, it } from "vitest";
import { initialPipelineStages } from "@/lib/pipeline-seed";
import { stageColor } from "@/lib/stage-color";

describe("pipeline locale seeds", () => {
  it("seeds Spanish by default and Portuguese when explicitly selected", () => {
    expect(initialPipelineStages("es").map(x => x.name)).toEqual(["Nuevo", "En conversación", "Interesado", "Cliente", "Perdido"]);
    expect(initialPipelineStages("pt-BR").map(x => x.name)).toEqual(["Novo", "Em conversa", "Interessado", "Cliente", "Perdido"]);
    expect(initialPipelineStages("pt-BR").map(x => x.kind)).toEqual(["open", "open", "open", "won", "lost"]);
  });
});
describe("stage colors", () => {
  it("keeps standard colors across Spanish and Portuguese labels and respects semantic kind", () => {
    expect(stageColor("Nuevo")).toBe(stageColor("Novo"));
    expect(stageColor("Interesado")).toBe(stageColor("Interessado"));
    expect(stageColor("custom stage", "won")).toBe("var(--success)");
    expect(stageColor("custom stage", "lost")).toBe("var(--danger)");
  });
  it("gives stable but differentiated colors to custom names", () => {
    expect(stageColor("Qualificação")).toBe(stageColor("Qualificação"));
    expect(stageColor("Qualificação")).not.toBe(stageColor("Aguardando"));
  });
});
