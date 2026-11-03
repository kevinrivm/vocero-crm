/** Paleta de colores predefinidos estándar para etapas y etiquetas del CRM */
export const CRM_PRESET_COLORS = [
  { name: "Azul Petróleo", hex: "#0F4C5C" },
  { name: "Esmeralda", hex: "#10B981" },
  { name: "Ámbar", hex: "#F59E0B" },
  { name: "Índigo", hex: "#6366F1" },
  { name: "Rosa", hex: "#EC4899" },
  { name: "Púrpura", hex: "#8B5CF6" },
  { name: "Café Oscuro", hex: "#3E2723" },
  { name: "Cian", hex: "#06B6D4" },
] as const;

export type PresetColor = (typeof CRM_PRESET_COLORS)[number]["hex"];

