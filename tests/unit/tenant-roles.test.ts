import { describe, expect, it } from "vitest";
import { canConfigure, isAgentOnly, isSuperAdmin } from "@/lib/auth/roles";
import { tenantUserRoles } from "@/lib/db/schema";
import { tenantNavGroups } from "@/lib/nav";

describe("Tenant Roles Hierarchy and Permissions", () => {
  it("defines exact tenant roles: owner, admin, sales, support", () => {
    expect(tenantUserRoles).toEqual(["owner", "admin", "sales", "support"]);
  });

  it("canConfigure permits only owner, admin, and superadmin", () => {
    expect(canConfigure("owner")).toBe(true);
    expect(canConfigure("admin")).toBe(true);
    expect(canConfigure("superadmin")).toBe(true);
    expect(canConfigure("super admin")).toBe(true);
    expect(canConfigure("sales")).toBe(false);
    expect(canConfigure("support")).toBe(false);
    expect(canConfigure("agente")).toBe(false);
    expect(canConfigure("member")).toBe(false);
  });

  it("isAgentOnly identifies sales, support, and agente as operators", () => {
    expect(isAgentOnly("sales")).toBe(true);
    expect(isAgentOnly("support")).toBe(true);
    expect(isAgentOnly("agente")).toBe(true);
    expect(isAgentOnly("owner")).toBe(false);
    expect(isAgentOnly("admin")).toBe(false);
    expect(isAgentOnly("superadmin")).toBe(false);
    expect(isAgentOnly("super admin")).toBe(false);
  });

  it("maps roles correctly for sales, support, and admin", () => {
    const mapTenantRole = (role?: string) =>
      role === "admin" ? "admin" : role === "support" ? "support" : "sales";

    expect(mapTenantRole("sales")).toBe("sales");
    expect(mapTenantRole("support")).toBe("support");
    expect(mapTenantRole("admin")).toBe("admin");
    expect(mapTenantRole(undefined)).toBe("sales");
  });

  it("permite a un administrador desactivar la opción de agenda a un perfil de soporte", () => {
    // Con agenda activa en la empresa y permiso activo (default):
    const groupsConAgenda = tenantNavGroups({
      role: "support",
      agenda: true,
      permissions: { agenda: true },
    });
    const hrefsConAgenda = groupsConAgenda[0]?.items.map((i: any) => i.href);
    expect(hrefsConAgenda).toContain("/bookings");

    // Administrador desactiva agenda para perfil de soporte:
    const groupsSinAgenda = tenantNavGroups({
      role: "support",
      agenda: true,
      permissions: { agenda: false },
    });
    const hrefsSinAgenda = groupsSinAgenda[0]?.items.map((i: any) => i.href);
    expect(hrefsSinAgenda).not.toContain("/bookings");
  });

  it("permite a un administrador desactivar contactos a un perfil", () => {
    const groupsSinContactos = tenantNavGroups({
      role: "sales",
      permissions: { contacts: false },
    });
    const hrefs = groupsSinContactos[0]?.items.map((i: any) => i.href);
    expect(hrefs).not.toContain("/contacts");
    expect(hrefs).toContain("/inbox");
  });
});
