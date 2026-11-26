import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { resolvePublicFormConfig } from "@/lib/public-form-config";
import {
  applyPublicFormTags,
  createOrReusePublicContact,
} from "@/server/public-forms/service";
import { resolveWidgetAccess, widgetOptions, withWidgetCors } from "@/server/public-forms/cors";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

const inputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().regex(/^\d{7,15}$/),
  email: z.string().trim().email().max(254).optional().or(z.literal("")),
  website: z.string().max(200).optional(),
});

export async function POST(req: Request, ctx: Params) {
  const { slug } = await ctx.params;
  const access = await resolveWidgetAccess(req, slug, "contact");
  if ("response" in access) return access.response;
  const { form, headers } = access.access;
  const rate = checkRateLimit(`public-contact:${slug}:${clientIp(req.headers)}`, {
    windowMs: 10 * 60_000,
    max: 6,
  });
  if (!rate.allowed) return withWidgetCors(apiError(429, "rate_limited", "Inténtalo de nuevo más tarde"), headers);
  const config = resolvePublicFormConfig(form.contactFormConfig, "contact");
  const emailField = config.fields.find((field) => field.key === "email")!;
  const body = await parseBody(req, inputSchema);
  if (!body.ok) return withWidgetCors(body.response, headers);
  if (emailField.required && !body.data.email?.trim()) {
    return withWidgetCors(apiError(422, "invalid_body", "El correo es obligatorio"), headers);
  }
  if (!emailField.enabled && body.data.email?.trim()) {
    return withWidgetCors(apiError(422, "invalid_body", "El correo no está habilitado en este formulario"), headers);
  }
  // Honeypot: devuelve aceptación genérica para no enseñar a los bots qué
  // campo activó el filtro, sin escribir ningún dato.
  if (body.data.website?.trim()) {
    return withWidgetCors(Response.json({ ok: true }, { status: 202 }), headers);
  }

  const result = await createOrReusePublicContact({
    organizationId: form.organizationId,
    name: body.data.name,
    phone: body.data.phone,
    email: body.data.email || null,
  });
  await applyPublicFormTags(form.organizationId, "contact", result.contact.id);
  return withWidgetCors(
    Response.json(
      {
        contact: { id: result.contact.id, name: result.contact.name },
        created: result.created,
        leadCreated: result.leadCreated,
      },
      { status: result.created ? 201 : 200 }
    ),
    headers
  );
}

export async function OPTIONS(req: Request, ctx: Params) {
  const { slug } = await ctx.params;
  return widgetOptions(req, slug, "contact");
}
