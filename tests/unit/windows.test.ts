import { describe, expect, it } from "vitest";
import { servidor, enlaceExterno, feed, marca, descargaPermitida, citasDebidas } from "../../apps/windows/src/politica.mjs";

describe("060 — fronteras del escritorio opcional", () => {
  it("exige HTTPS y admite solo loopback en desarrollo", () => {
    expect(servidor("https://crm.example.test/")).toBe("https://crm.example.test");
    expect(() => servidor("http://localhost:3014")).toThrow();
    expect(servidor("http://localhost:3014", true)).toBe("http://localhost:3014");
  });
  it("no abre protocolos ejecutables ni credenciales", () => {
    expect(enlaceExterno("file:///C:/programa.exe")).toBeNull();
    expect(enlaceExterno("https://usuario:clave@example.test")).toBeNull();
  });
  it("la marca sale del manifest, con icono del mismo origen", () => {
    expect(marca({name:"Taller Demo",theme_color:"#123456",icons:[{src:"/icon.png",type:"image/png"}]}, "https://crm.example.test").nombre).toBe("Taller Demo");
    expect(() => marca({name:"Demo",theme_color:"#123456",icons:[{src:"https://externo.test/icon.png",type:"image/png"}]}, "https://crm.example.test")).toThrow();
  });
  it("el feed es opcional y seguro", () => {
    expect(feed("")).toBe(""); expect(() => feed("http://descargas.test")).toThrow();
  });
  it("no descarga con redirección externa", () => {
    expect(descargaPermitida(["https://crm.example.test/a", "https://externo.test/b"], "https://crm.example.test")).toBe(false);
  });
  it("deduplica citas y excluye Laboratorio", () => {
    const c = {id:"bk_prueba",kind:"session",status:"agendada",isTest:false,scheduledAtUtc:"2026-10-23T15:00:00Z"};
    const ahora = Date.parse(c.scheduledAtUtc);
    expect(citasDebidas([c], [], ahora)).toHaveLength(1);
    expect(citasDebidas([c], [c.id+":"+c.scheduledAtUtc], ahora)).toHaveLength(0);
    expect(citasDebidas([{...c,isTest:true}], [], ahora)).toHaveLength(0);
  });
});
