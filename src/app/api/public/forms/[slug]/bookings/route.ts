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
} from "@/server/public-forms/service";
import { resolveWidgetAccess, widgetOptions, withWidgetCors } from "@/server/public-forms/cors";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

const inputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().regex(/^\d{7,15}$/),
  email: z.string().trim().email().max(254).optional().or(z.literal("")),
  startUtc: z.string().datetime({ offset: true }),
  website: z.string().max(200).optional(),
});

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
  if (!agendaEnabled()) return apiError(404, "not_found", "Agenda no disponible");
  const { slug } = await ctx.params;
  const access = await resolveWidgetAccess(req, slug, "booking");
  if ("response" in access) return access.response;
  const { form, headers } = access.access;
  const rate = checkRateLimit(`public-booking:${slug}:${clientIp(req.headers)}`, {
    windowMs: 10 * 60_000,
    max: 8,
  });
  if (!rate.allowed) return withWidgetCors(apiError(429, "rate_limited", "Inténtalo de nuevo más tarde"), headers);
  const config = resolvePublicFormConfig(form.bookingFormConfig, "booking");
  const emailField = config.fields.find((field) => field.key === "email")!;
  const body = await parseBody(req, inputSchema);
  if (!body.ok) return withWidgetCors(body.response, headers);
  if (emailField.required && !body.data.email?.trim()) {
    return withWidgetCors(apiError(422, "invalid_body", "El correo es obligatorio"), headers);
  }
  if (!emailField.enabled && body.data.email?.trim()) {
    return withWidgetCors(apiError(422, "invalid_body", "El correo no está habilitado en este formulario"), headers);
  }
  if (body.data.website?.trim()) {
    return withWidgetCors(Response.json({ ok: true }, { status: 202 }), headers);
  }

  const contact = await createOrReusePublicContact({
    organizationId: form.organizationId,
    name: body.data.name,
    phone: body.data.phone,
    email: body.data.email || null,
  });
  const existing = await existingBooking(form.organizationId, contact.contact.id, body.data.startUtc);
  if (existing) {
    await applyPublicFormTags(form.organizationId, "booking", contact.contact.id);
    return withWidgetCors(
      Response.json(
        { booking: { id: existing.id }, contact: { id: contact.contact.id }, repeated: true },
        { status: 200 }
      ),
      headers
    );
  }

  try {
    const result = await createSessionBooking({
      organizationId: form.organizationId,
      contactId: contact.contact.id,
      startUtc: body.data.startUtc,
      source: "manual",
      requireOffer: false,
    });
    await applyPublicFormTags(form.organizationId, "booking", contact.contact.id);
    return withWidgetCors(
      Response.json(
        {
          booking: { id: result.booking.id, startUtc: result.booking.scheduledAt.toISOString() },
          contact: { id: contact.contact.id },
          meetingLink: result.meetingLink,
          linkPending: result.linkPending,
        },
        { status: 201 }
      ),
      headers
    );
  } catch (err) {
    // Un reintento del mismo evento webhook/formulario encuentra la cita que
    // ganó la carrera y devuelve el recurso existente, sin duplicarlo.
    const repeated = await existingBooking(form.organizationId, contact.contact.id, body.data.startUtc);
    if (repeated) {
      await applyPublicFormTags(form.organizationId, "booking", contact.contact.id);
      return withWidgetCors(
        Response.json(
          { booking: { id: repeated.id }, contact: { id: contact.contact.id }, repeated: true },
          { status: 200 }
        ),
        headers
      );
    }
    if (err instanceof BookingError) return withWidgetCors(bookingErrorResponse(err), headers);
    throw err;
  }
}

export async function OPTIONS(req: Request, ctx: Params) {
  if (!agendaEnabled()) return apiError(404, "not_found", "Agenda no disponible");
  const { slug } = await ctx.params;
  return widgetOptions(req, slug, "booking");
}
