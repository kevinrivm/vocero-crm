import { describe, it, expect, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { servidorValido, configurarMarca, preparar, textoAndroid } from "../../apps/android/preparar.mjs";

const manifest = (name = "Taller de ejemplo") => ({ name, theme_color: "#070e20", icons: [{ src: "/icono.png", sizes: "512x512", purpose: "any", type: "image/png" }] });
const carpetas: string[] = [];
const servidores: Server[] = [];
afterEach(async () => {
  await Promise.all(servidores.splice(0).map(s => new Promise<void>(r => { s.closeAllConnections(); s.close(() => r()); })));
  await Promise.all(carpetas.splice(0).map(p => rm(p, { recursive: true, force: true })));
});

describe("053: marca Android desde el PWA", () => {
  it("exige HTTPS sin credenciales ni ruta y solo permite HTTP local explícito", () => {
    expect(servidorValido("https://crm.example/")).toBe("https://crm.example");
    for (const u of ["http://crm.example", "https://user:pass@crm.example", "https://crm.example/inbox", "https://crm.example/?x=1", "https://crm.example/#x", "file:///tmp"]) expect(() => servidorValido(u)).toThrow();
    expect(() => servidorValido("http://localhost:3003")).toThrow();
    expect(servidorValido("http://localhost:3003", true)).toBe("http://localhost:3003");
    expect(() => servidorValido("http://otro.example", true)).toThrow();
  });
  it("no mezcla el icono de otra instancia ni acepta un paquete inválido", () => {
    expect(configurarMarca(manifest(), "https://crm.example", "org.ejemplo.crm").nombre).toBe("Taller de ejemplo");
    expect(() => configurarMarca({ ...manifest(), icons: [{ ...manifest().icons[0], src: "https://otra.example/i.png" }] }, "https://crm.example", "org.ejemplo.crm")).toThrow();
    expect(() => configurarMarca(manifest(), "https://crm.example", "paquete-invalido")).toThrow();
    expect(() => configurarMarca({ ...manifest(), theme_color: "invalid" }, "https://crm.example", "org.ejemplo.crm")).toThrow();
  });
  it("escapa texto como recurso Android sin perder comillas o apóstrofos", () => {
    expect(textoAndroid('Ana & "Hijos"')).toBe('"Ana &amp; \\&quot;Hijos\\&quot;"');
    expect(textoAndroid("D'Ávila <CRM>")).toBe('"D&apos;Ávila &lt;CRM&gt;"');
  });
  it("prepara dos marcas, conserva paquete por origen y bloquea fallback ante fallo", async () => {
    let nombre = "Negocio Uno", fallo = false;
    const png = Buffer.alloc(24); Buffer.from("89504e470d0a1a0a", "hex").copy(png); png.writeUInt32BE(512, 16); png.writeUInt32BE(512, 20);
    const s = createServer((req, res) => {
      if (fallo) { res.writeHead(302, { location: "/otro" }); res.end(); return; }
      res.end(req.url === "/manifest.webmanifest" ? JSON.stringify(manifest(nombre)) : png);
    });
    servidores.push(s);
    await new Promise<void>(r => s.listen(0, "127.0.0.1", r));
    const address = s.address(); if (!address || typeof address === "string") throw new Error("Sin puerto");
    const destino = await mkdtemp(join(tmpdir(), "android-marca-")); carpetas.push(destino);
    const opciones = { servidor: `http://127.0.0.1:${address.port}`, pruebas: true, destino };
    const primera = await preparar(opciones);
    nombre = "Negocio Dos";
    const segunda = await preparar(opciones);
    expect(segunda.paquete).toBe(primera.paquete);
    expect(JSON.parse(await readFile(join(destino, "config.json"), "utf8")).nombre).toBe("Negocio Dos");
    expect(await readFile(join(destino, "res/drawable-nodpi/icono_marca.png"))).toEqual(png);
    fallo = true;
    await expect(preparar(opciones)).rejects.toThrow();
    await expect(access(join(destino, "config.json"))).rejects.toThrow();
  });
});
