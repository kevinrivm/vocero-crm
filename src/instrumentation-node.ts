import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { mediaDirStatus } from "@/server/media-dir";
import { leerConfigDespacho } from "@/server/brains/config";
import { iniciarWorker, tanda } from "@/server/dispatch/worker";
import { cifrarSecretosEnClaro } from "@/server/zernio/secreto-guardado";
import { barrido, iniciarBarrido } from "@/server/webhooks/worker";

/**
 * Asegura de forma no bloqueante que la tabla internal_message tenga la columna "read".
 */
export async function ensureInternalMessageColumns(): Promise<void> {
  try {
    const db = getDb();
    await db.execute(sql`
      ALTER TABLE "internal_message" ADD COLUMN IF NOT EXISTS "read" boolean DEFAULT false NOT NULL;
    `);
  } catch (err) {
    // Si la BD aún no está disponible en este ciclo de arranque, se ignora limpiamente
  }
}

/**
 * Asegura de forma no bloqueante que la tabla sticky_note exista.
 */
export async function ensureStickyNoteTable(): Promise<void> {
  try {
    const db = getDb();
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "sticky_note" (
        "id" text PRIMARY KEY NOT NULL,
        "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE cascade,
        "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
        "title" text,
        "content" text DEFAULT '' NOT NULL,
        "color" text DEFAULT 'yellow' NOT NULL,
        "is_pinned" boolean DEFAULT false NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "sticky_note_org_user_idx" ON "sticky_note" ("organization_id", "user_id", "created_at");
    `);
  } catch (err) {
    // Si la BD aún no está disponible en este ciclo de arranque, se ignora limpiamente
  }
}

/**
 * Asegura de forma no bloqueante que la tabla calendar_integration exista.
 */
export async function ensureCalendarIntegrationTable(): Promise<void> {
  try {
    const db = getDb();
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "calendar_integration" (
        "id" text PRIMARY KEY NOT NULL,
        "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE cascade,
        "provider" text NOT NULL,
        "access_token_cipher" text NOT NULL,
        "access_token_iv" text NOT NULL,
        "access_token_tag" text NOT NULL,
        "refresh_token_cipher" text,
        "refresh_token_iv" text,
        "refresh_token_tag" text,
        "expires_at" timestamp,
        "account_email" text,
        "account_name" text,
        "scope" text,
        "status" text DEFAULT 'connected' NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "calendar_int_org_provider_uq" ON "calendar_integration" ("organization_id", "provider");
      CREATE INDEX IF NOT EXISTS "calendar_int_org_idx" ON "calendar_integration" ("organization_id");
    `);
  } catch (err) {
    // Ignorar si la BD aún no está disponible
  }
}

/**
 * Asegura de forma no bloqueante que la tabla tenant_role_permission exista.
 */
export async function ensureTenantRolePermissionTable(): Promise<void> {
  try {
    const db = getDb();
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "tenant_role_permission" (
        "id" text PRIMARY KEY NOT NULL,
        "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE cascade,
        "role" text NOT NULL,
        "permission" text NOT NULL,
        "enabled" boolean DEFAULT true NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "tenant_role_perm_org_role_perm_uq" ON "tenant_role_permission" ("organization_id", "role", "permission");
      CREATE INDEX IF NOT EXISTS "tenant_role_perm_org_idx" ON "tenant_role_permission" ("organization_id");
    `);
  } catch (err) {
    // Ignorar si la BD aún no está disponible
  }
}

/**
 * 008 — Aviso al arranque si MEDIA_DIR no es escribible. Sin esto, el primer
 * síntoma era un 500 al subir el logo o el icono, o adjuntos entrantes "no
 * disponibles" (se reintentan al abrirlos, pero solo mientras Meta los
 * conserve), con el EACCES enterrado en el log de un request. Se prueba
 * escribiendo de verdad (lo mismo que hará saveMediaFile) y nunca tumba el
 * arranque: el resto del CRM funciona sin adjuntos.
 *
 * El sondeo vive en `server/media-dir.ts` y es el mismo que `/api/health`
 * expone como `mediaWritable` (#82): este resultado queda cacheado y el
 * healthcheck lo reutiliza en vez de volver a escribir.
 */
export async function checkMediaDir(): Promise<void> {
  const media = await mediaDirStatus();
  // Sin entorno válido no hay nada que sondear: lo reporta, con detalle, el
  // primer getEnv() de la app.
  if (!media || media.writable) return;
  if (media.store === "bucket") {
    // 037 — Sin decir el endpoint completo ni las llaves: solo el host.
    console.error(
      `[boot] MEDIA_STORE=bucket pero el bucket${media.dir ? ` (${media.dir})` : ""} no acepta escrituras (${media.code}): los adjuntos, el logo y el icono se guardan en disco mientras tanto. ` +
        "Revisa MEDIA_BUCKET_ENDPOINT, MEDIA_BUCKET_NAME, MEDIA_BUCKET_KEY_ID y MEDIA_BUCKET_SECRET, y que el bucket exista."
    );
    return;
  }
  console.error(
    `[boot] MEDIA_DIR=${media.dir} no es escribible (${media.code}): los adjuntos entrantes, el logo y el icono NO se van a poder guardar. ` +
      "En Docker: monta un volumen persistente en /data (la imagen ya usa /data/media) y arranca el contenedor como root —el default—, " +
      "que el entrypoint le da el volumen al usuario de la app. Fuera de Docker: apunta MEDIA_DIR a un directorio escribible."
  );
}

/**
 * Limpieza al arranque (FR-034): corridas del Laboratorio que quedaron
 * "running" tras un reinicio → fallidas. Solo corre en el runtime Node.
 */
export async function cleanupOrphanRuns(): Promise<void> {
  try {
    const db = getDb();
    const updated = await db
      .update(schema.agentTestRun)
      .set({
        status: "failed",
        error: "Interrumpida por un reinicio del servidor",
        finishedAt: new Date(),
      })
      .where(eq(schema.agentTestRun.status, "running"))
      .returning({ id: schema.agentTestRun.id });
    if (updated.length > 0) {
      console.log(
        `[boot] ${updated.length} corrida(s) del Laboratorio huérfana(s) marcada(s) como fallida(s)`
      );
    }
  } catch (err) {
    // La BD puede no estar lista aún (migraciones corren antes del server).
    console.error("[boot] limpieza de corridas huérfanas falló:", err);
  }
}

/**
 * 030 — Cifra los secretos de firma de Zernio que una versión anterior guardó
 * en claro. Va aquí y no en `migrate.mjs` porque cifrar necesita la
 * `ENCRYPTION_KEY` validada y el mismo `encryptSecret` que el token, y porque
 * así corre también con `next dev` (spec 030, D3). Nunca tumba el arranque:
 * mientras una fila no esté cifrada, su secreto se sigue leyendo (D5).
 */
export async function encryptLegacySecrets(): Promise<void> {
  try {
    const cifrados = await cifrarSecretosEnClaro();
    if (cifrados > 0) {
      console.log(`[boot] ${cifrados} secreto(s) de firma de Zernio cifrado(s) en reposo`);
    }
  } catch (err) {
    console.error(
      "[boot] no se pudieron cifrar los secretos de firma de Zernio guardados en claro; se reintenta en el próximo arranque:",
      err instanceof Error ? err.message : "error desconocido"
    );
  }
}

/**
 * 021 — Reanuda el despacho al arrancar. Sin esto, un turno que quedó
 * pendiente o a medio reintentar cuando el contenedor se reinició esperaría a
 * que llegara OTRO mensaje para que alguien encendiera el worker.
 *
 * Solo con el despacho activo: una instancia sin cerebro no barre nada. Y lo
 * mal configurado se dice aquí una vez, además de en la tarjeta «Quién
 * responde»: es el log que alguien mira cuando el agente no contesta.
 */
export function resumeDispatch(): void {
  const config = leerConfigDespacho();
  if (config.active) {
    iniciarWorker();
    void tanda();
    console.log(`[boot] despacho al cerebro activo → ${config.host}`);
    return;
  }
  if (config.problem === "url") {
    console.error(
      "[boot] BRAIN_DISPATCH_URL no es una URL http:// o https:// válida (sin usuario:clave): el despacho al cerebro queda INACTIVO."
    );
  } else if (config.problem === "sin_llave") {
    console.error(
      "[boot] BRAIN_DISPATCH_URL está definida pero falta BOT_API_KEY (mínimo 16 caracteres): el despacho al cerebro queda INACTIVO."
    );
  }
}

/**
 * 047 — Arranca el barrido de los eventos de webhook. Siempre: la ingesta es
 * del núcleo. La primera pasada retoma lo que el reinicio dejó a medias (un
 * evento en proceso cuya reserva venció, o uno pendiente de reintento).
 */
export function resumeWebhooks(): void {
  iniciarBarrido();
  void barrido();
}
