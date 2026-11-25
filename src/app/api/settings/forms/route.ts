import { asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { getEnv } from "@/lib/env";
import { normalizeAllowedOrigin, publicFormConfigSchema } from "@/lib/public-form-config";
import { agendaEnabled } from "@/server/agenda/flag";
import {
  ensurePublicFormSettings,
  getPublicFormTagIds,
} from "@/server/public-forms/service";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  if (!canConfigure(session.role)) {
    return apiError(403, "forbidden", "No puedes configurar formularios");
  }
  const [settings, org] = await Promise.all([
    ensurePublicFormSettings(session.organizationId),
    getDb()
      .select({ slug: schema.organization.slug })
      .from(schema.organization)
      .where(eq(schema.organization.id, session.organizationId))
      .limit(1),
  ]);
  const slug = org[0]?.slug ?? null;
  const origin = getEnv().APP_BASE_URL.replace(/\/+$/, "");
  const publicSlug = slug ? encodeURIComponent(slug) : null;
  const htmlSlug = slug?.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;") ?? null;
  const widgetScript = `${origin}/vocero-form-widget.js`;
  const embedWidget = (kind: "contact" | "booking") =>
    `<div data-vocero-form data-slug="${htmlSlug}" data-kind="${kind}"></div>\n<script src="${widgetScript}" defer></script>`;
  const contactTags = await getPublicFormTagIds(session.organizationId, "contact");
  const bookingTags = await getPublicFormTagIds(session.organizationId, "booking");
  const tags = await getDb()
    .select({ id: schema.contactTag.id, name: schema.contactTag.name })
    .from(schema.contactTag)
    .where(scoped(schema.contactTag.organizationId, session.organizationId))
    .orderBy(asc(schema.contactTag.name));
  return Response.json({
    settings: settings
      ? {
          contactEnabled: settings.contactEnabled,
          bookingEnabled: settings.bookingEnabled,
          contactFormConfig: settings.contactFormConfig,
          bookingFormConfig: settings.bookingFormConfig,
          allowedOrigins: settings.allowedOrigins,
          formTags: { contact: contactTags, booking: bookingTags },
        }
      : { contactEnabled: false, bookingEnabled: false, formTags: { contact: [], booking: [] } },
    slug,
    urls: slug
      ? {
          contact: `${origin}/forms/${publicSlug}/contact`,
          booking: `${origin}/forms/${publicSlug}/booking`,
        }
      : null,
    embed: slug
      ? {
          contact: embedWidget("contact"),
          booking: embedWidget("booking"),
        }
      : null,
    tags,
    webhook: {
      endpoint: slug ? `${origin}/api/webhooks/forms/${publicSlug}` : null,
      hasSecret: Boolean(settings?.webhookSecretHash),
    },
    agendaEnabled: agendaEnabled(),
  });
});

const putSchema = z.object({
  contactEnabled: z.boolean().optional(),
  bookingEnabled: z.boolean().optional(),
  contactFormConfig: publicFormConfigSchema.optional(),
  bookingFormConfig: publicFormConfigSchema.optional(),
  allowedOrigins: z.array(
    z.string().trim().max(255).refine((value) => normalizeAllowedOrigin(value) !== null)
  ).max(20).optional(),
  formTags: z.object({
    contact: z.array(z.string().min(1)).max(30).refine((ids) => new Set(ids).size === ids.length),
    booking: z.array(z.string().min(1)).max(30).refine((ids) => new Set(ids).size === ids.length),
  }).optional(),
});

export const PUT = withAuth(async (session, req: Request) => {
  if (!canConfigure(session.role)) {
    return apiError(403, "forbidden", "No puedes configurar formularios");
  }
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;
  if (body.data.bookingEnabled && !agendaEnabled()) {
    return apiError(409, "agenda_disabled", "La agenda no está habilitada en esta instancia");
  }
  const current = await ensurePublicFormSettings(session.organizationId);
  if (!current) return apiError(409, "no_org", "No hay organización activa");
  const requestedTagIds = body.data.formTags
    ? [...body.data.formTags.contact, ...body.data.formTags.booking]
    : [];
  if (requestedTagIds.length > 0) {
    const ownedTags = await getDb()
      .select({ id: schema.contactTag.id })
      .from(schema.contactTag)
      .where(
        scoped(
          schema.contactTag.organizationId,
          session.organizationId,
          inArray(schema.contactTag.id, requestedTagIds)
        )
      );
    if (ownedTags.length !== new Set(requestedTagIds).size) {
      return apiError(422, "invalid_body", "Una o más etiquetas no pertenecen a esta organización");
    }
  }

  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (body.data.contactEnabled !== undefined) update.contactEnabled = body.data.contactEnabled;
  if (body.data.bookingEnabled !== undefined) update.bookingEnabled = body.data.bookingEnabled;
  if (body.data.contactFormConfig !== undefined) update.contactFormConfig = body.data.contactFormConfig;
  if (body.data.bookingFormConfig !== undefined) update.bookingFormConfig = body.data.bookingFormConfig;
  if (body.data.allowedOrigins !== undefined) {
    update.allowedOrigins = [...new Set(body.data.allowedOrigins.map((value) => normalizeAllowedOrigin(value)!))];
  }

  await getDb().transaction(async (tx) => {
    await tx
      .update(schema.publicFormSettings)
      .set(update)
      .where(
        scoped(
          schema.publicFormSettings.organizationId,
          session.organizationId,
          eq(schema.publicFormSettings.id, current.id)
        )
      );
    if (body.data.formTags) {
      for (const kind of ["contact", "booking"] as const) {
        await tx
          .delete(schema.publicFormTagAssignment)
          .where(
            scoped(
              schema.publicFormTagAssignment.organizationId,
              session.organizationId,
              eq(schema.publicFormTagAssignment.formKind, kind)
            )
          );
        const tagIds = body.data.formTags[kind];
        if (tagIds.length > 0) {
          await tx.insert(schema.publicFormTagAssignment).values(
            tagIds.map((tagId) => ({
              organizationId: session.organizationId,
              formKind: kind,
              tagId,
            }))
          );
        }
      }
    }
  });
  return Response.json({ ok: true });
});
