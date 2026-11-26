import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { apiError, withAuth } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import {
  ensurePublicFormSettings,
  hashWebhookSecret,
} from "@/server/public-forms/service";

export const dynamic = "force-dynamic";

export const POST = withAuth(async (session) => {
  if (!canConfigure(session.role)) {
    return apiError(403, "forbidden", "No puedes configurar formularios");
  }
  const settings = await ensurePublicFormSettings(session.organizationId);
  if (!settings) return apiError(409, "no_org", "No hay organización activa");
  const secret = `vf_${randomBytes(32).toString("base64url")}`;
  await getDb()
    .update(schema.publicFormSettings)
    .set({ webhookSecretHash: hashWebhookSecret(secret), updatedAt: new Date() })
    .where(
      scoped(
        schema.publicFormSettings.organizationId,
        session.organizationId,
        eq(schema.publicFormSettings.id, settings.id)
      )
    );
  return Response.json({ secret });
});

export const DELETE = withAuth(async (session) => {
  if (!canConfigure(session.role)) {
    return apiError(403, "forbidden", "No puedes configurar formularios");
  }
  const settings = await ensurePublicFormSettings(session.organizationId);
  if (!settings) return apiError(409, "no_org", "No hay organización activa");
  await getDb()
    .update(schema.publicFormSettings)
    .set({ webhookSecretHash: null, updatedAt: new Date() })
    .where(
      scoped(
        schema.publicFormSettings.organizationId,
        session.organizationId,
        eq(schema.publicFormSettings.id, settings.id)
      )
    );
  return Response.json({ ok: true });
});
