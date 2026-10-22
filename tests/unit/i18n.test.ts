import { describe, expect, it } from "vitest";
import { es, ptBR, type MessageKey } from "@/lib/i18n/messages";
import { interpolate, plural, resolveLocale, translator, systemText } from "@/lib/i18n";
import { DEFAULT_BRANDING, normalizeBranding } from "@/lib/branding";
import { brandingMetadata } from "@/lib/branding-metadata";
import { formatMoneyCents, parseMoneyToCents } from "@/lib/money";
import { dayHeading, longDayLabel, wallClock } from "@/lib/time/calendar";
import { bookingTitle } from "@/components/bookings/booking-look";
import { previewText } from "@/components/inbox/helpers";
describe("idiomas de interfaz", () => {
  it("todos los catálogos tienen las mismas claves y parámetros", () => {
    expect(Object.keys(ptBR).sort()).toEqual(Object.keys(es).sort());
    const parameters = (s:string) => [...s.matchAll(/\{([a-zA-Z]\w*)\}/g)].map(m=>m[1]).sort();
    for(const key of Object.keys(es) as MessageKey[]) {
      expect(ptBR[key].trim(),key).not.toBe("");
      expect(parameters(ptBR[key]),key).toEqual(parameters(es[key]));
    }
  });
  it("resuelve navegador, empresa y respaldo sin compartir preferencias", () => {
    expect(resolveLocale("pt-BR","es")).toBe("pt-BR");
    expect(resolveLocale("es","pt-BR")).toBe("es");
    expect(resolveLocale(null,"pt-BR")).toBe("pt-BR");
    expect(resolveLocale("fr","pt-BR")).toBe("pt-BR");
    expect(resolveLocale(null,"incorrecto")).toBe("es");
    const a=translator("pt-BR"),b=translator("es");
    expect(a("Guardar")).toBe("Salvar");
    expect(b("Guardar")).toBe("Guardar");
    expect(a("Guardar")).toBe("Salvar");
  });
  it("interpola una sola vez sin traducir datos ni variables de WhatsApp", () => {
    expect(interpolate("Hola {name}; {{1}}", {name:"{otro}"})).toBe("Hola {otro}; {{1}}");
    expect(interpolate("Valor de {{{v0}}}",{v0:1})).toBe("Valor de {{1}}");
    expect(systemText("pt-BR","Contato livre")).toBe("Contato livre");
    expect(previewText("Guardar","pt-BR")).toBe("Guardar");
    expect(bookingTitle({kind:"block",notes:"Guardar"} as Parameters<typeof bookingTitle>[0],"pt-BR")).toBe("Guardar");
  });
  it("pluraliza cero, uno y varios", () => {
    const forms={one:"{count} contacto",other:"{count} contactos"} as const;
    expect(plural("pt-BR",1,forms)).toBe("1 contato");
    expect(plural("pt-BR",2,forms)).toBe("2 contatos");
    expect(plural("es",0,forms)).toBe("0 contactos");
  });
  it("conserva marca, favicon y metadatos al extender el idioma", () => {
    const original={integration:{id:"intacto"},branding:{future:"intacto",locale:"es"}};
    const value={...DEFAULT_BRANDING,locale:"pt-BR" as const,currency:"USD" as const,favicon:{mime:"image/png",version:12}};
    const saved=JSON.parse(brandingMetadata(JSON.stringify(original),value));
    expect(saved.integration).toEqual(original.integration);
    expect(saved.branding).toMatchObject({...value,future:"intacto"});
    expect(normalizeBranding({}).locale).toBe("es");
    expect(normalizeBranding({locale:"pt_BR"} as unknown as Partial<typeof DEFAULT_BRANDING>).locale).toBe("es");
    for(const raw of [null,"{","[]","null"]) expect(JSON.parse(brandingMetadata(raw,value)).branding.locale).toBe("pt-BR");
  });
  it("formatea en portugués sin cambiar moneda, instante ni huso", () => {
    expect(formatMoneyCents(123456,"BRL","pt-BR")).toMatch(/1\.234,56/);
    expect(formatMoneyCents(123456,"USD","pt-BR")).toContain("US$");
    expect(parseMoneyToCents("1.234,56")).toBe(123456);
    expect(dayHeading("2026-10-21","pt-BR").weekday).toContain("qua");
    expect(longDayLabel("2026-10-21","pt-BR")).toContain("outubro");
    expect(wallClock("2026-10-21T02:00:00Z","America/Sao_Paulo")).toEqual({day:"2026-10-20",minutes:1380});
  });
});
