import { describe, expect, it } from "vitest";
import {
  appNavGroups,
  isNavActive,
  SETTINGS_ITEM,
  settingsSections,
  tenantNavGroups,
} from "@/lib/nav";

/**
 * #87 — El menú agrupado y Ajustes en tres secciones. Lo que aparece y lo
 * que no lo deciden las banderas (`AGENDA`, `CHANNELS`, `ATRIBUCION`) y el
 * rol; aquí se afirma sobre el modelo, sin dibujar nada.
 */

const labels = (groups: { items: { label: string }[] }[]) =>
  groups.map((g) => g.items.map((i) => i.label));

describe("barra lateral agrupada", () => {
  it("con todo apagado y como miembro: Trabajo, Agente y Resultados", () => {
    const groups = appNavGroups({ role: "member" });
    expect(groups.map((g) => g.title)).toEqual(["Trabajo", "Agente", undefined]);
    expect(labels(groups)).toEqual([
      ["Bandeja", "Pipeline", "Contactos"],
      ["Agente", "Laboratorio"],
      ["Resultados"],
    ]);
  });

  it("un agente solo ve la Bandeja en Trabajo y no ve Agente ni Resultados", () => {
    const groups = appNavGroups({ role: "agente" });
    expect(groups.map((g) => g.title)).toEqual(["Trabajo"]);
    expect(labels(groups)).toEqual([["Bandeja"]]);
  });

  it("un superadmin tiene acceso a la sección Plataforma (/superadmin) con opciones globales", () => {
    const groups = appNavGroups({ isSuperAdmin: true, role: "owner" });
    expect(groups.map((g) => g.title)).toEqual([
      "Visión General",
      "Comunicaciones",
      "Gestión de Clientes",
      "Sistema",
    ]);
    const todosHrefs = groups.flatMap((g) => g.items.map((i) => i.href));
    expect(todosHrefs).toEqual([
      "/superadmin",
      "/superadmin/analytics",
      "/superadmin/whatsapp",
      "/superadmin/broadcast",
      "/superadmin/users",
      "/superadmin/modules",
      "/superadmin/billing",
      "/superadmin/settings",
    ]);
    const todosLabels = groups.flatMap((g) => g.items.map((i) => i.label));
    expect(todosLabels).not.toContain("Bandeja");
    expect(todosLabels).not.toContain("Contactos");
  });

  it("AGENDA añade Citas al final de Trabajo", () => {
    const [trabajo] = appNavGroups({ agenda: true, role: "member" });
    expect(trabajo!.items.map((i) => i.label)).toEqual([
      "Bandeja",
      "Pipeline",
      "Contactos",
      "Citas",
    ]);
    expect(trabajo!.items.at(-1)!.href).toBe("/bookings");
  });

  it("la guía de inicio abre el grupo Agente solo para quien configura", () => {
    for (const role of ["owner", "admin"]) {
      const agente = appNavGroups({ role })[1]!;
      expect(agente.items[0]).toMatchObject({ href: "/onboarding", label: "Guía de inicio" });
    }
    for (const role of ["member", null, undefined]) {
      const agente = appNavGroups({ role })[1]!;
      expect(agente.items.map((i) => i.href)).not.toContain("/onboarding");
    }
  });

  it("solo la Bandeja lleva el contador y Ajustes queda fuera de los grupos", () => {
    const todos = appNavGroups({ agenda: true, role: "owner" }).flatMap((g) => g.items);
    expect(todos.filter((i) => i.badge).map((i) => i.href)).toEqual(["/inbox"]);
    expect(todos.map((i) => i.href)).not.toContain("/settings");
    expect(SETTINGS_ITEM.href).toBe("/settings");
    // Cada entrada trae su icono: el renglón lo pinta sin condicionar.
    for (const item of [...todos, SETTINGS_ITEM]) expect(item.icon).toBeDefined();
  });

  it("una ruta hija activa su entrada, y /settings no activa nada más", () => {
    expect(isNavActive("/inbox/cv_123", "/inbox")).toBe(true);
    expect(isNavActive("/inbox", "/inbox")).toBe(true);
    expect(isNavActive("/inboxes", "/inbox")).toBe(false);
    expect(isNavActive("/settings/ai", "/settings")).toBe(true);
    expect(isNavActive("/settings/ai", "/agent")).toBe(false);
    // Alias de navegación para el Tenant
    expect(isNavActive("/pipeline", "/pipeline")).toBe(true);
    expect(isNavActive("/settings/whatsapp", "/whatsapp-setup")).toBe(true);
    expect(isNavActive("/settings/team", "/team")).toBe(true);
  });
});

describe("menú lateral del tenant (tenantNavGroups)", () => {
  it("un agente únicamente ve la categoría Operaciones con Bandeja, Contactos y Pipeline", () => {
    for (const role of ["agente", "agent"]) {
      const groups = tenantNavGroups({ role });
      expect(groups.map((g) => g.title)).toEqual(["Operaciones"]);
      expect(groups[0]?.items.map((i) => i.href)).toEqual(["/inbox", "/contacts", "/pipeline"]);
      expect(groups[0]?.items.map((i) => i.label)).toEqual([
        "Bandeja de Entrada",
        "Base de Contactos",
        "Pipeline",
      ]);
    }
  });

  it("un admin u owner ve Operaciones, Configuración CRM y Administración", () => {
    for (const role of ["admin", "owner"]) {
      const groups = tenantNavGroups({ role });
      expect(groups.map((g) => g.title)).toEqual([
        "Operaciones",
        "Configuración CRM",
        "Administración",
      ]);
      expect(groups[0]?.items.map((i) => i.href)).toEqual(["/inbox", "/contacts", "/pipeline"]);
      expect(groups[1]?.items.map((i) => i.href)).toEqual(["/crm-settings"]);
      expect(groups[2]?.items.map((i) => i.href)).toEqual([
        "/ai-agent",
        "/integrations",
        "/team",
        "/appearance",
        "/subscription",
      ]);
      expect(groups[2]?.items.map((i) => i.label)).toEqual([
        "Agente IA",
        "Canales & API",
        "Equipo de Trabajo",
        "Marca y Apariencia",
        "Mi Suscripción",
      ]);
    }
  });

  it("un perfil de soporte ve cada una de las bandejas por canal vinculado", () => {
    // Por rol 'support'
    const groupsSupport = tenantNavGroups({
      role: "support",
      linkedChannels: ["whatsapp", "messenger"],
    });
    expect(groupsSupport.map((g) => g.title)).toEqual(["Operaciones"]);
    expect(groupsSupport[0]?.items.map((i) => i.href)).toEqual([
      "/inbox",
      "/inbox?channel=whatsapp",
      "/inbox?channel=messenger",
      "/contacts",
      "/pipeline",
    ]);
    expect(groupsSupport[0]?.items.map((i) => i.label)).toEqual([
      "Bandeja General",
      "WhatsApp",
      "Messenger",
      "Base de Contactos",
      "Pipeline",
    ]);

    // Por usuario con nombre 'Soporte'
    const groupsUser = tenantNavGroups({
      role: "owner",
      userName: "Soporte",
      linkedChannels: ["whatsapp", "messenger", "instagram"],
    });
    expect(groupsUser[0]?.items.map((i) => i.href)).toEqual([
      "/inbox",
      "/inbox?channel=whatsapp",
      "/inbox?channel=messenger",
      "/inbox?channel=instagram",
      "/contacts",
      "/pipeline",
    ]);
  });

  it("con agenda: true añade Citas a Operaciones y Agenda a Administración", () => {
    const groupsAgent = tenantNavGroups({ role: "agent", agenda: true });
    expect(groupsAgent[0]?.items.map((i) => i.href)).toEqual([
      "/inbox",
      "/contacts",
      "/pipeline",
      "/bookings",
    ]);

    const groupsAdmin = tenantNavGroups({ role: "admin", agenda: true });
    expect(groupsAdmin[0]?.items.map((i) => i.href)).toEqual([
      "/inbox",
      "/contacts",
      "/pipeline",
      "/bookings",
    ]);
    expect(groupsAdmin[2]?.items.map((i) => i.href)).toContain("/settings/calendar");
  });

  it("isNavActive distingue correctamente los canales de la bandeja", () => {
    expect(isNavActive("/inbox", "/inbox", null)).toBe(true);
    expect(isNavActive("/inbox", "/inbox?channel=whatsapp", null)).toBe(false);

    expect(isNavActive("/inbox", "/inbox", "whatsapp")).toBe(false);
    expect(isNavActive("/inbox", "/inbox?channel=whatsapp", "whatsapp")).toBe(true);
    expect(isNavActive("/inbox", "/inbox?channel=messenger", "whatsapp")).toBe(false);

    expect(isNavActive("/inbox", "/inbox?channel=messenger", "messenger")).toBe(true);
    expect(isNavActive("/inbox", "/inbox", "messenger")).toBe(false);
  });
});

describe("ajustes en tres secciones", () => {
  const links = (s: { title: string; links: { label: string }[] }[]) =>
    Object.fromEntries(s.map((x) => [x.title, x.links.map((l) => l.label)]));

  it("con todo apagado: Canales, Agente y Negocio con lo mínimo", () => {
    const sections = settingsSections({});
    expect(sections.map((s) => s.title)).toEqual(["Canales", "Agente", "Negocio"]);
    expect(links(sections)).toEqual({
      Canales: ["WhatsApp"],
      Agente: ["IA"],
      Negocio: ["Marca", "Apariencia", "Plantillas", "Respuestas rápidas", "Equipo"],
    });
  });

  it("cada bandera añade su enlace en su sección y en ninguna otra", () => {
    // 023: con un canal social, "Estado" abre la sección.
    expect(links(settingsSections({ messenger: true }))).toEqual({
      Canales: ["Estado", "WhatsApp", "Messenger"],
      Agente: ["IA"],
      Negocio: ["Marca", "Apariencia", "Plantillas", "Respuestas rápidas", "Equipo"],
    });
    expect(links(settingsSections({ instagram: true })).Canales).toEqual([
      "Estado",
      "WhatsApp",
      "Instagram",
    ]);
    expect(
      links(settingsSections({ instagram: true, messenger: true, tiktok: true })).Canales
    ).toEqual(["Estado", "WhatsApp", "Instagram", "Messenger", "TikTok"]);
    expect(links(settingsSections({ agenda: true }))).toEqual({
      Canales: ["WhatsApp"],
      Agente: ["IA", "Agenda"],
      Negocio: ["Marca", "Apariencia", "Plantillas", "Respuestas rápidas", "Equipo"],
    });
    expect(links(settingsSections({ atribucion: true }))).toEqual({
      Canales: ["WhatsApp"],
      Agente: ["IA"],
      Negocio: ["Marca", "Apariencia", "Plantillas", "Respuestas rápidas", "Equipo", "Anuncios"],
    });
  });

  it("con todo encendido, cada pantalla de Ajustes tiene exactamente un enlace", () => {
    const all = settingsSections({
      agenda: true,
      atribucion: true,
      instagram: true,
      messenger: true,
      tiktok: true,
    })
      .flatMap((s) => s.links)
      .map((l) => l.href);
    expect(new Set(all).size).toBe(all.length);
    expect(all.sort()).toEqual(
      [
        "/settings/channels",
        "/settings/whatsapp",
        "/settings/instagram",
        "/settings/messenger",
        "/settings/tiktok",
        "/settings/ai",
        "/settings/calendar",
        "/settings/branding",
        "/settings/appearance",
        "/settings/templates",
        "/settings/quick-replies",
        "/settings/team",
        "/settings/ads",
      ].sort()
    );
  });

  it("el Laboratorio no está en Ajustes: sigue en el menú principal", () => {
    const hrefs = settingsSections({ agenda: true, atribucion: true, messenger: true })
      .flatMap((s) => s.links)
      .map((l) => l.href);
    expect(hrefs).not.toContain("/lab");
    expect(appNavGroups({ role: "owner" }).flatMap((g) => g.items).map((i) => i.href)).toContain("/lab");
  });
});
