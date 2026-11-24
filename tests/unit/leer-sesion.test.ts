import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardián de la sesión de 7 días (073, ver `src/lib/auth/leer-sesion.ts`).
 *
 * En el servidor la sesión se lee siempre sin renovar: una lectura que renueva
 * alarga la base y pierde el `Set-Cookie`, y la cookie del navegador se queda
 * con la caducidad del login. Si alguien vuelve a llamar `api.getSession`
 * directo, esta prueba lo señala.
 */
const SRC = path.resolve(import.meta.dirname, "../../src");
const PERMITIDO = path.join(SRC, "lib", "auth", "leer-sesion.ts");

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = path.join(dir, nombre);
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    return /\.(ts|tsx)$/.test(nombre) ? [ruta] : [];
  });
}

describe("lectura de la sesión en el servidor", () => {
  it("solo leerSesion llama a api.getSession", () => {
    const culpables = archivos(SRC)
      .filter((f) => f !== PERMITIDO)
      .filter((f) => /\.api\s*\.getSession\s*\(/.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(SRC, f));
    expect(culpables).toEqual([]);
  });

  it("leerSesion pide la sesión sin renovarla", () => {
    expect(readFileSync(PERMITIDO, "utf8")).toMatch(/disableRefresh:\s*true/);
  });
});
