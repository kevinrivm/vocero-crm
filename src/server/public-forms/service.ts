import { createHash, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { normalizeMx } from "@/lib/meta/client";
import type { PublicFormKind } from "@/lib/public-form-config";
import { createLeadForContact } from "@/server/inbox/lead-activity";

export type { PublicFormKind } from "@/lib/public-form-config";

export async function ensurePublicFormSettings(organizationId: string) {
  const db = getDb();
  await db
    .insert(schema.publicFormSettings)
    .values({
      id: newId("publicFormSettings"),
      organizationId,
    })
    .onConflictDoNothing({ target: schema.publicFormSettings.organizationId });
  const rows = await db
    .select()
    .from(schema.publicFormSettings)
    .where(scoped(schema.publicFormSettings.organizationId, organizationId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getPublicFormForSlug(slug: string, kind: PublicFormKind) {
  if (!slug || slug.length > 120) return null;
  const rows = await getDb()
    .select({
      organizationId: schema.organization.id,
      organizationName: schema.organization.name,
      slug: schema.organization.slug,
      contactEnabled: schema.publicFormSettings.contactEnabled,
      bookingEnabled: schema.publicFormSettings.bookingEnabled,
      contactFormConfig: schema.publicFormSettings.contactFormConfig,
      bookingFormConfig: schema.publicFormSettings.bookingFormConfig,
      allowedOrigins: schema.publicFormSettings.allowedOrigins,
    })
    .from(schema.organization)
    .innerJoin(
      schema.publicFormSettings,
      eq(schema.publicFormSettings.organizationId, schema.organization.id)
    )
    .where(eq(schema.organization.slug, slug))
    .limit(1);
  const form = rows[0];
  if (!form) return null;
  if (kind === "contact" && !form.contactEnabled) return null;
  if (kind === "booking" && !form.bookingEnabled) return null;
  return form;
}

export async function getWebhookSettingsForSlug(slug: string) {
  if (!slug || slug.length > 120) return null;
  const rows = await getDb()
    .select({
      organizationId: schema.organization.id,
      webhookSecretHash: schema.publicFormSettings.webhookSecretHash,
      contactFormConfig: schema.publicFormSettings.contactFormConfig,
      bookingFormConfig: schema.publicFormSettings.bookingFormConfig,
    })
    .from(schema.organization)
    .innerJoin(
      schema.publicFormSettings,
      eq(schema.publicFormSettings.organizationId, schema.organization.id)
    )
    .where(eq(schema.organization.slug, slug))
    .limit(1);
  return rows[0] ?? null;
}

export async function getPublicFormTagIds(organizationId: string, kind: PublicFormKind) {
  const rows = await getDb()
    .select({ tagId: schema.publicFormTagAssignment.tagId })
    .from(schema.publicFormTagAssignment)
    .where(
      scoped(
        schema.publicFormTagAssignment.organizationId,
        organizationId,
        eq(schema.publicFormTagAssignment.formKind, kind)
      )
    );
  return rows.map((row) => row.tagId);
}

/** Añade las etiquetas elegidas para el formulario; conserva las etiquetas manuales. */
export async function applyPublicFormTags(
  organizationId: string,
  kind: PublicFormKind,
  contactId: string
) {
  const tagIds = await getPublicFormTagIds(organizationId, kind);
  if (tagIds.length === 0) return;
  await getDb()
    .insert(schema.contactTagAssignment)
    .values(tagIds.map((tagId) => ({ organizationId, contactId, tagId })))
    .onConflictDoNothing();
}

export async function createOrReusePublicContact(input: {
  organizationId: string;
  name: string;
  phone: string;
  email?: string | null;
}) {
  const phone = normalizeMx(input.phone);
  const email = input.email?.trim().toLowerCase() || null;
  const db = getDb();
  const inserted = await db
    .insert(schema.contact)
    .values({
      id: newId("contact"),
      organizationId: input.organizationId,
      channel: "whatsapp",
      waIdentity: phone,
      phone,
      email,
      name: input.name.trim(),
      nameSource: "manual",
      source: "organico",
    })
    .onConflictDoNothing({
      target: [
        schema.contact.organizationId,
        schema.contact.channel,
        schema.contact.waIdentity,
      ],
    })
    .returning();

  let contact = inserted[0];
  if (!contact) {
    const existing = await db
      .select()
      .from(schema.contact)
      .where(
        scoped(
          schema.contact.organizationId,
          input.organizationId,
          eq(schema.contact.channel, "whatsapp"),
          eq(schema.contact.waIdentity, phone)
        )
      )
      .limit(1);
    contact = existing[0];
    if (!contact) throw new Error("No se pudo resolver el contacto del formulario");
    if (!contact.email && email) {
      const updated = await db
        .update(schema.contact)
        .set({ email, updatedAt: new Date() })
        .where(
          scoped(
            schema.contact.organizationId,
            input.organizationId,
            eq(schema.contact.id, contact.id)
          )
        )
        .returning();
      contact = updated[0] ?? contact;
    }
  }

  const lead = await createLeadForContact({
    organizationId: input.organizationId,
    contactId: contact.id,
    source: "sistema",
  });
  return {
    contact,
    created: inserted.length > 0,
    leadCreated: Boolean(lead),
  };
}

export function hashWebhookSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function matchesWebhookSecret(secret: string, expectedHash: string | null): boolean {
  if (!expectedHash || !/^[a-f0-9]{64}$/i.test(expectedHash)) return false;
  const actual = Buffer.from(hashWebhookSecret(secret), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return timingSafeEqual(actual, expected);
}
