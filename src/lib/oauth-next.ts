/**
 * 069 — A dónde volver tras entrar cuando el login lo pidió el OAuth del
 * MCP. Solo rutas propias de `/oauth/`: cualquier otra cosa en `next` se
 * ignora, para que el login no sea un redireccionador abierto.
 *
 * Vive en `lib/` y sin dependencias: lo usa la página de login, que corre en
 * el navegador.
 */
export function siguienteSeguro(next: string | string[] | undefined): string | null {
  if (typeof next !== "string" || !next.startsWith("/oauth/authorize?") || next.includes("//") || next.includes("\\")) {
    return null;
  }
  return next;
}
