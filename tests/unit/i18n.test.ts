import { describe, expect, it } from "vitest";
import { TEMAS } from "@/lib/temas";
import { HERRAMIENTAS, ROLES } from "@/lib/agent-roles";
import { es, ptBR, type MessageKey } from "@/lib/i18n/messages";
import { interpolate, plural, resolveLocale, translator, systemText } from "@/lib/i18n";
import { DEFAULT_BRANDING, normalizeBranding } from "@/lib/branding";
import { brandingMetadata } from "@/lib/branding-metadata";
import { formatMoneyCents, parseMoneyToCents } from "@/lib/money";
import { dayHeading, longDayLabel, wallClock } from "@/lib/time/calendar";
import { bookingTitle } from "@/components/bookings/booking-look";
import { previewText } from "@/components/inbox/helpers";
describe("idiomas de interfaz", () => {
  it("mantiene el idioma al incorporar los temas y errores de 2.5", () => {
    for (const tema of Object.values(TEMAS)) {
      expect(ptBR[tema.descripcion as MessageKey], tema.descripcion).toBeTruthy();
    }
    expect(systemText("pt-BR", "Noche")).toBe("Noite");
    expect(systemText("pt-BR", "El texto casi no se lee sobre el fondo (1.0:1; hace falta 7:1).")).toContain("é necessário 7:1");
    expect(systemText("pt-BR", "Sin internet. Los mensajes nuevos aparecerán al volver la red.")).toContain("Sem internet");
  });
  it("traduce las pistas pendientes y conserva las variables técnicas", () => {
    expect(systemText("pt-BR", "Dale un nombre y escribe sus instrucciones o carga conocimiento del negocio")).toBe("Dê um nome ao agente e escreva suas instruções ou adicione informações sobre a empresa");
    expect(systemText("pt-BR", "Levanta tu agente (Nea) al lado del CRM y pon BRAIN_DISPATCH_URL y BOT_API_KEY en el entorno")).toBe("Execute seu agente (Nea) junto ao CRM e configure BRAIN_DISPATCH_URL e BOT_API_KEY no ambiente");
    expect(systemText("pt-BR", "Tu agente (localhost:8000) está configurado pero no contesta")).toBe("Seu agente (localhost:8000) está configurado, mas não responde");
    expect(systemText("pt-BR", "El /health de localhost:8000 no responde: revisa que el servicio esté corriendo.")).toBe("O /health de localhost:8000 não responde: verifique se o serviço está em execução.");
  });
  it("incluye las etiquetas y descripciones dinámicas de roles y herramientas", () => {
    for (const item of [...Object.values(ROLES), ...HERRAMIENTAS]) {
      for (const text of [item.etiqueta, item.descripcion]) {
        expect(Object.prototype.hasOwnProperty.call(ptBR, text), text).toBe(true);
        expect(systemText("es", text)).toBe(text);
      }
    }
    expect(systemText("pt-BR", ROLES.calificador.etiqueta)).toBe("Qualificação comercial");
    expect(systemText("pt-BR", HERRAMIENTAS.find(h => h.clave === "escalar")!.etiqueta)).toBe("Transferir para uma pessoa");
  });
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
