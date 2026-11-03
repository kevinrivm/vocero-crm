import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import { isValidHex } from "@/lib/branding";
import { getBrandingContext, updateTenantAppearance } from "@/server/branding";

export const dynamic = "force-dynamic";

const hexOrNull = z
  .string()
  .trim()
  .refine((val) => val === "" || isValidHex(val), "Color HEX inválido (#rrggbb o #rgb)")
  .nullable()
  .optional()
  .transform((val) => (val === "" ? null : val));

const putSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  logoUrl: z.string().trim().nullable().optional(),
  primaryColor: hexOrNull,
  sidebarColor: hexOrNull,
});

export const GET = withAuth(async (session) => {
  const ctx = await getBrandingContext(session.organizationId);
  return Response.json({
    ok: true,
    appearance: {
      name: ctx.branding.name,
      logoUrl: ctx.branding.logoUrl || null,
      primaryColor: ctx.branding.primaryColor || null,
      sidebarColor: ctx.branding.sidebarColor || null,
    },
  });
});

export const PUT = withAuth(async (session, req: Request) => {
  if (!canConfigure(session.role, session.userRole)) {
    return apiError(403, "forbidden", "Solo administradores o propietarios pueden cambiar la apariencia");
  }

  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;

  await updateTenantAppearance(session.organizationId, {
    name: body.data.name,
    logoUrl: body.data.logoUrl,
    primaryColor: body.data.primaryColor,
    sidebarColor: body.data.sidebarColor,
  });

  return Response.json({ ok: true });
});

