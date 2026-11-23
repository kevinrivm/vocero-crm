import { responderMcp } from "@/server/mcp/servidor";

export const dynamic = "force-dynamic";

/**
 * MCP de Vocero (Streamable HTTP, sin estado). Solo POST: no hay flujo de
 * servidor a cliente, así que GET responde 405 (lo hace Next solo), que es lo
 * que el transporte pide cuando el servidor no ofrece SSE.
 */
export const POST = responderMcp;
