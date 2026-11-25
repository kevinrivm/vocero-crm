import { describe, expect, it } from "vitest";
import { buscaEnMensajes, fragmentoConCoincidencia, patronLike } from "@/lib/busqueda-mensajes";

const resaltado = (texto: string, q: string) =>
  fragmentoConCoincidencia(texto, q).filter((t) => t.coincide).map((t) => t.texto);

describe("079 — fragmento con la coincidencia resaltada", () => {
  it("resalta sobre el texto original aunque la consulta no lleve acentos", () => {
    expect(resaltado("Me pasas la CUÉNTA de Ana", "cuenta de ana")).toEqual(["CUÉNTA de Ana"]);
    expect(resaltado("la cuenta", "CUÉNTA")).toEqual(["cuenta"]);
    expect(resaltado("¿Hacen envíos a Toluca?", "envios")).toEqual(["envíos"]);
  });

  it("la ñ cuenta como n, igual que en la base", () => {
    expect(resaltado("Quiero una piñata grande", "pinata")).toEqual(["piñata"]);
  });

  it("recorta alrededor de la coincidencia con puntos suspensivos", () => {
    const largo = `${"palabra ".repeat(30)}cuenta de Ana ${"cola ".repeat(40)}`;
    const tramos = fragmentoConCoincidencia(largo, "cuenta");
    expect(tramos[0]!.texto.startsWith("…")).toBe(true);
    expect(tramos.at(-1)!.texto.endsWith("…")).toBe(true);
    expect(tramos.map((t) => t.texto).join("").length).toBeLessThan(largo.length);
  });

  it("sin coincidencia devuelve el principio sin resaltar", () => {
    expect(fragmentoConCoincidencia("hola", "zzz")).toEqual([{ texto: "hola", coincide: false }]);
  });

  it("colapsa saltos de línea", () => {
    expect(fragmentoConCoincidencia("uno\n\ndos cuenta", "cuenta").map((t) => t.texto).join("")).toBe(
      "uno dos cuenta"
    );
  });
});

describe("079 — reglas", () => {
  it("escapa los comodines de LIKE", () => {
    expect(patronLike("100%_x\\")).toBe("%100\\%\\_x\\\\%");
  });
  it("busca en mensajes desde 3 caracteres, sin contar espacios", () => {
    expect(buscaEnMensajes("ho")).toBe(false);
    expect(buscaEnMensajes("  ho  ")).toBe(false);
    expect(buscaEnMensajes("hol")).toBe(true);
  });
});
