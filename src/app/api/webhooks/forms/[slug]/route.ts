import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { resolvePublicFormConfig } from "@/lib/public-form-config";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { agendaEnabled } from "@/server/agenda/flag";
import { bookingErrorResponse } from "@/server/agenda/http";
import { BookingError, createSessionBooking } from "@/server/agenda/service";
import {
  applyPublicFormTags,
  createOrReusePublicContact,
  getWebhookSettingsForSlug,
  matchesWebhookSecret,
} from "@/server/public-forms/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

const common = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().regex(/^\d{7,15}$/),
  email: z.string().trim().email().max(254).optional().or(z.literal("")),
});

const webhookSchema = z.discriminatedUnion("type", [
  common.extend({ type: z.literal("contact") }),
  common.extend({
    type: z.literal("booking"),
    startUtc: z.string().datetime({ offset: true }),
    notes: z.string().trim().max(2000).optional(),
  }),
]);

async function existingBooking(organizationId: string, contactId: string, startUtc: string) {
  const rows = await getDb()
    .select({ id: schema.booking.id })
    .from(schema.booking)
    .where(
      scoped(
        schema.booking.organizationId,
        organizationId,
        eq(schema.booking.contactId, contactId),
        eq(schema.booking.scheduledAt, new Date(startUtc)),
        eq(schema.booking.status, "agendada"),
        eq(schema.booking.isTest, false)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function POST(req: Request, ctx: Params) {
  const { slug } = await ctx.params;
  const rate = checkRateLimit(`forms-webhook:${clientIp(req.headers)}`, {
    windowMs: 10 * 60_000,
    max: 30,
  });
  if (!rate.allowed) return apiError(429, "rate_limited", "Inténtalo de nuevo más tarde");

  const settings = await getWebhookSettingsForSlug(slug);
  const authorization = req.headers.get("authorization") ?? "";
  const secret = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
  if (!settings || !matchesWebhookSecret(secret, settings.webhookSecretHash)) {
    return apiError(401, "unauthorized", "Credenciales inválidas");
  }

  const body = await parseBody(req, webhookSchema);
  if (!body.ok) return body.response;
  const kind = body.data.type;
  const formConfig = resolvePublicFormConfig(
    kind === "contact" ? settings.contactFormConfig : settings.bookingFormConfig,
    kind
  );
  const emailField = formConfig.fields.find((field) => field.key === "email")!;
  if (emailField.required && !body.data.email?.trim()) {
    return apiError(422, "invalid_body", "El correo es obligatorio");
  }
  if (!emailField.enabled && body.data.email?.trim()) {
    return apiError(422, "invalid_body", "El correo no está habilitado en este formulario");
  }
  if (body.data.type === "contact") {
    const result = await createOrReusePublicContact({
      organizationId: settings.organizationId,
      name: body.data.name,
      phone: body.data.phone,
      email: body.data.email || null,
    });
    await applyPublicFormTags(settings.organizationId, "contact", result.contact.id);
    return Response.json(
      {
        contact: { id: result.contact.id, name: result.contact.name },
        created: result.created,
        leadCreated: result.leadCreated,
      },
      { status: result.created ? 201 : 200 }
    );
  }

  if (!agendaEnabled()) {
    return apiError(404, "not_found", "Formulario de citas no disponible");
  }
  const contact = await createOrReusePublicContact({
    organizationId: settings.organizationId,
    name: body.data.name,
    phone: body.data.phone,
    email: body.data.email || null,
  });
  const existing = await existingBooking(settings.organizationId, contact.contact.id, body.data.startUtc);
  if (existing) {
    await applyPublicFormTags(settings.organizationId, "booking", contact.contact.id);
    return Response.json(
      { booking: { id: existing.id }, contact: { id: contact.contact.id }, repeated: true },
      { status: 200 }
    );
  }

  try {
    const result = await createSessionBooking({
      organizationId: settings.organizationId,
      contactId: contact.contact.id,
      startUtc: body.data.startUtc,
      notes: body.data.notes ?? null,
      source: "manual",
      requireOffer: false,
    });
    await applyPublicFormTags(settings.organizationId, "booking", contact.contact.id);
    return Response.json(
      {
        booking: { id: result.booking.id, startUtc: result.booking.scheduledAt.toISOString() },
        contact: { id: contact.contact.id },
        repeated: false,
      },
      { status: 201 }
    );
  } catch (err) {
    const repeated = await existingBooking(settings.organizationId, contact.contact.id, body.data.startUtc);
    if (repeated) {
      await applyPublicFormTags(settings.organizationId, "booking", contact.contact.id);
      return Response.json(
        { booking: { id: repeated.id }, contact: { id: contact.contact.id }, repeated: true },
        { status: 200 }
      );
    }
    if (err instanceof BookingError) return bookingErrorResponse(err);
    throw err;
  }
}
