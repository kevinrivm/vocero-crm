import { apiError } from "@/lib/api";
import { publicFormKindSchema, resolvePublicFormConfig } from "@/lib/public-form-config";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { resolveWidgetAccess, widgetOptions, withWidgetCors } from "@/server/public-forms/cors";
import { agendaEnabled } from "@/server/agenda/flag";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function GET(req: Request, ctx: Params) {
  const { slug } = await ctx.params;
  const kind = publicFormKindSchema.safeParse(new URL(req.url).searchParams.get("kind"));
  if (!kind.success) return apiError(422, "invalid_kind", "Tipo de formulario inválido");
  if (kind.data === "booking" && !agendaEnabled()) return apiError(404, "not_found", "Formulario no disponible");

  const result = await resolveWidgetAccess(req, slug, kind.data);
  if ("response" in result) return result.response;
  const { form, headers } = result.access;
  const rate = checkRateLimit(`public-form-config:${slug}:${clientIp(req.headers)}`, {
    windowMs: 10 * 60_000,
    max: 120,
  });
  if (!rate.allowed) return withWidgetCors(apiError(429, "rate_limited", "Inténtalo de nuevo más tarde"), headers);
  const config = resolvePublicFormConfig(
    kind.data === "contact" ? form.contactFormConfig : form.bookingFormConfig,
    kind.data
  );
  return withWidgetCors(
    Response.json(
      {
        slug: form.slug,
        organizationName: form.organizationName,
        kind: kind.data,
        config,
      },
      { headers: { "Cache-Control": "no-store" } }
    ),
    headers
  );
}

export async function OPTIONS(req: Request, ctx: Params) {
  const { slug } = await ctx.params;
  const kind = publicFormKindSchema.safeParse(new URL(req.url).searchParams.get("kind"));
  if (!kind.success) return apiError(422, "invalid_kind", "Tipo de formulario inválido");
  if (kind.data === "booking" && !agendaEnabled()) return apiError(404, "not_found", "Formulario no disponible");
  return widgetOptions(req, slug, kind.data);
}
