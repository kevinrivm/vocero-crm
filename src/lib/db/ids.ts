import { customAlphabet } from "nanoid";

const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
const nano = customAlphabet(alphabet, 20);

const prefixes = {
  organization: "org",
  member: "mem",
  contact: "ct",
  conversation: "cv",
  message: "msg",
  lead: "ld",
  stage: "stg",
  leadStageEvent: "lse",
  credentials: "cred",
  agentProfile: "agp",
  kbEntry: "kb",
  template: "tpl",
  testRun: "run",
  testCase: "case",
  mediaAsset: "ma",
  // 015 — motor de agenda
  calendarSettings: "cal",
  booking: "bk",
  offeredSlot: "ofs",
  zoomCredentials: "zcred",
  googleCredentials: "gcred",
  // 016 — atribución de anuncios
  adAttribution: "att",
  conversionEvent: "cve",
  capiSettings: "capi",
  // Ajustes → IA (issue #85)
  aiCredentials: "aicred",
  // 021 — despacho al cerebro
  dispatch: "dsp",
  // 026 — el aviso de que una conversación se eliminó
  olvido: "olv",
  // 047 — eventos de webhook guardados antes de procesarse
  webhookEvent: "whe",
  // 049 — respuestas rápidas
  quickReply: "qr",
  // 050 — notas internas del hilo
  conversationNote: "nota",
  // Comunicación interna entre agentes
  internalMessage: "imsg",
  // Anuncios globales del Súper Admin
  announcement: "ann",
  // Historial de pagos y facturación del Súper Admin
  payment: "pay",
  // Etiquetas del CRM
  tag: "tag",
  // Multilínea 1:N por Tenant
  tenantChannel: "tc",
  // Notas adhesivas / Sticky Notes para agentes
  stickyNote: "snote",
  // Integraciones de Calendario / Videollamadas OAuth (Google Workspace & Microsoft 365)
  calendarIntegration: "calint",
  // Permisos por perfil/rol del Tenant
  tenantRolePermission: "trp",
} as const;

export type IdKind = keyof typeof prefixes;

export function newId(kind: IdKind): string {
  return `${prefixes[kind]}_${nano()}`;
}
