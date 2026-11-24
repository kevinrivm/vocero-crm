/**
 * 017 — Estado en memoria del mock de Zernio (solo dev/test). Vive en
 * globalThis porque Next recarga módulos en dev; una instancia = un proceso,
 * así que el outbox en memoria alcanza para las aserciones del self-test.
 */

export type ZernioSentMessage = {
  n: number;
  conversationId: string;
  accountId: string | null;
  message: string;
  /** Presente solo fuera de la ventana de 24 h. */
  messagingType?: string;
  messageTag?: string;
  /** Llave de idempotencia con la que llegó, si la hubo. */
  idempotencyKey: string | null;
  at: string;
};

/** 072 — Una reacción que el CRM puso (`emoji`) o quitó (`emoji` = ""). */
export type ZernioSentReaction = {
  conversationId: string;
  messageId: string;
  accountId: string | null;
  emoji: string;
  at: string;
};

/** 023: una cuenta de `GET /accounts`, con la forma real de esa API. */
export type ZernioMockAccount = {
  _id: string;
  platform: string;
  username?: string | null;
  displayName?: string | null;
  platformUserId?: string | null;
  isActive?: boolean;
  needsReconnection?: boolean;
  platformStatus?: string | null;
  tiktokAccountType?: string | null;
  profileId?: { _id: string } | null;
  metadata?: { selectedPageId?: string; selectedPageName?: string } | null;
};

/** 023: un webhook de `/webhooks/settings`. */
export type ZernioMockWebhook = {
  _id: string;
  name: string;
  url: string;
  secret: string | null;
  events: string[];
  isActive: boolean;
  accountIds: string[];
  failureCount: number;
  lastFiredAt: string | null;
};

type ZernioMockState = {
  seq: number;
  sent: ZernioSentMessage[];
  /** 072 */
  reactions: ZernioSentReaction[];
  /** 023 */
  accounts: ZernioMockAccount[];
  webhooks: ZernioMockWebhook[];
  /** Rutas que responden 503 hasta el siguiente `_reset` (p. ej. "webhooks/settings"). */
  down: string[];
  /** Cuántas veces se leyó cada ruta, para afirmar sobre la caché. */
  hits: Record<string, number>;
};

const g = globalThis as unknown as { __voceroZernioMock?: ZernioMockState };

export function zernioMockState(): ZernioMockState {
  if (!g.__voceroZernioMock) {
    g.__voceroZernioMock = { seq: 0, sent: [], reactions: [], accounts: [], webhooks: [], down: [], hits: {} };
  }
  // Un proceso que venía de antes de la 023 (recarga en caliente).
  const s = g.__voceroZernioMock;
  s.reactions ??= [];
  s.accounts ??= [];
  s.webhooks ??= [];
  s.down ??= [];
  s.hits ??= {};
  return s;
}

/** Vacía lo enviado. El contador NO se reinicia: ver `nextZernioMessageId`. */
export function resetZernioMock(): void {
  // Las cuentas y los webhooks NO se vacían: son el escenario, y el arnés lo
  // cambia con `_accounts` y `_webhooks` cuando quiere otro.
  const s = zernioMockState();
  s.sent = [];
  s.reactions = [];
  s.down = [];
  s.hits = {};
}

/**
 * Id del mensaje que el mock le devuelve al CRM.
 *
 * Lleva la marca de tiempo del proceso, no solo un contador: el CRM guarda ese
 * id con un índice ÚNICO, así que dos corridas del arnés contra la misma base
 * chocarían con `zmock_1` y el envío fallaría por una colisión del harness,
 * que se ve igual que un bug del producto.
 */
export function nextZernioMessageId(): string {
  const state = zernioMockState();
  return `zmock_${Date.now().toString(36)}_${++state.seq}`;
}

/**
 * Una llave que termina en `-invalid` se rechaza, igual que hace el mock de
 * Graph: es como el arnés comprueba que unas credenciales malas NO se guardan.
 */
export function zernioTokenIsBad(authorization: string | null): boolean {
  const token = (authorization ?? "").replace(/^Bearer\s+/i, "");
  return token.length === 0 || token.endsWith("-invalid");
}
