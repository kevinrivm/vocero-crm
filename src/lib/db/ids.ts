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
  // 069 — API pública v1, MCP y su OAuth
  apiKey: "ak",
  oauthClient: "vc",
  oauthGrant: "og",
  oauthToken: "ot",
  // 070 — chats fijados
  conversationPin: "pin",
  // 072 — reacciones a mensajes
  messageReaction: "rx",
  // 076 — la IA volvió sola a una conversación en pausa
  iaVuelta: "iav",
} as const;

export type IdKind = keyof typeof prefixes;

export function newId(kind: IdKind): string {
  return `${prefixes[kind]}_${nano()}`;
}
