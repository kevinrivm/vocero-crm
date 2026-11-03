import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #86 — Quién entra a la guía y a dónde manda la raíz. Las dos páginas se
 * prueban con sus dependencias falsas: solo interesa la decisión.
 */

const getSessionOrNull = vi.hoisted(() => vi.fn());
const guideStatus = vi.hoisted(() => vi.fn());
const guideFirst = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({ getSessionOrNull }));
vi.mock("@/server/onboarding/guide", () => ({ guideStatus, guideFirst }));
vi.mock("@/components/onboarding/onboarding-client", () => ({
  OnboardingClient: () => null,
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve([{ name: "Sofi" }]) }),
      }),
    }),
  }),
  schema: { agentProfile: { organizationId: "organization_id", name: "name" } },
}));

import OnboardingPage from "@/app/(app)/onboarding/page";
import Home from "@/app/page";
import { canConfigure } from "@/lib/auth/roles";

const owner = { userId: "usr_1", organizationId: "org_1", role: "owner" };
const member = { userId: "usr_2", organizationId: "org_1", role: "member" };

beforeEach(() => {
  getSessionOrNull.mockReset();
  guideStatus.mockReset();
  guideFirst.mockReset();
});

describe("quién configura", () => {
  it("el propietario y un admin; un miembro del equipo no", () => {
    expect(canConfigure("owner")).toBe(true);
    expect(canConfigure("admin")).toBe(true);
    expect(canConfigure("member")).toBe(false);
    expect(canConfigure(undefined)).toBe(false);
  });
});

describe("/onboarding", () => {
  it("sin sesión manda al login", async () => {
    getSessionOrNull.mockResolvedValue(null);
    await expect(OnboardingPage()).rejects.toThrow("redirect:/login");
  });

  it("un miembro del equipo va a la Bandeja: no puede hacer ningún paso", async () => {
    getSessionOrNull.mockResolvedValue(member);
    await expect(OnboardingPage()).rejects.toThrow("redirect:/inbox");
    expect(guideStatus).not.toHaveBeenCalled();
  });

  it("el propietario ve la guía resuelta en el servidor", async () => {
    getSessionOrNull.mockResolvedValue(owner);
    guideStatus.mockResolvedValue({ steps: [], complete: false, enabled: false });
    const page = (await OnboardingPage()) as { props: { agentName: string | null } };
    expect(guideStatus).toHaveBeenCalledWith("org_1");
    expect(page.props.agentName).toBe("Sofi");
  });
});

describe("la raíz", () => {
  it("sin sesión manda al login", async () => {
    getSessionOrNull.mockResolvedValue(null);
    await expect(Home()).rejects.toThrow("redirect:/login");
    expect(guideFirst).not.toHaveBeenCalled();
  });

  it("al superadmin lo manda a /superadmin", async () => {
    getSessionOrNull.mockResolvedValue({ ...owner, isSuperAdmin: true });
    await expect(Home()).rejects.toThrow("redirect:/superadmin");
  });

  it("al dueño o admin lo manda directo a la Bandeja /inbox sin bloqueo de onboarding", async () => {
    getSessionOrNull.mockResolvedValue(owner);
    await expect(Home()).rejects.toThrow("redirect:/inbox");
  });
});
