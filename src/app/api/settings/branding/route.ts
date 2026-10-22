import { z } from "zod";
import { LOCALES } from "@/lib/i18n/locale";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getSessionOrNull } from "@/lib/auth/session";
import { isValidHex, resolveAccentSet } from "@/lib/branding";
import { CURRENCIES } from "@/lib/money";
import { getBranding, saveBranding } from "@/server/branding";

export const dynamic = "force-dynamic";

/** GET público: el login necesita la marca antes de autenticarse. */
export async function GET() {
  const session = await getSessionOrNull();
  const branding = await getBranding(session?.organizationId);
  return Response.json({ branding, accentSet: resolveAccentSet(branding.accent) });
}

const putSchema = z.object({
  name: z.string().trim().min(1).max(30),
  accent: z.string().refine(isValidHex, "Color hex inválido (#rrggbb)"),
  /** La moneda del negocio: la única que el tablero suma. */
  currency: z.enum(CURRENCIES),
  locale: z.enum(LOCALES).optional(),
});

export const PUT = withAuth(async (session, req: Request) => {
  if (session.role !== "owner") {
    return apiError(403, "forbidden", "Solo el propietario puede cambiar la marca");
  }
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;
  // El icono se conserva: este formulario es de nombre, color y moneda, y se
  // sube y se quita por su propia ruta. Sin esto, guardar el nombre borraría
  // el logo sin que nadie lo pidiera.
  const actual = await getBranding(session.organizationId);
  await saveBranding(session.organizationId, {
    ...body.data,
    favicon: actual.favicon,
    locale: body.data.locale ?? actual.locale,
  });
  return Response.json({ ok: true });
});
