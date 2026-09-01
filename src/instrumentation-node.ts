import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { createLogger } from "@/lib/logger";

const log = createLogger("boot");

/**
 * Limpieza al arranque (FR-034): corridas del Laboratorio que quedaron
 * "running" tras un reinicio → fallidas, con SUS casos individuales
 * sacados de pending/running (si no, la UI del Lab muestra personas
 * "corriendo" para siempre en una corrida que ya no existe en memoria).
 * Solo corre en el runtime Node.
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
      // Los casos quedan judge_failed: con el enum cerrado
      // [pending, running, done, judge_failed] es el único estado terminal
      // que ya usa la UI para "sin veredicto", y computeScore lo excluye
      // del denominador — una corrida interrumpida no infla ni hunde el score.
      await db
        .update(schema.agentTestCase)
        .set({ status: "judge_failed" })
        .where(
          inArray(
            schema.agentTestCase.runId,
            updated.map((r) => r.id)
          )
        );
      log.info("corridas del Laboratorio huérfanas marcadas como fallidas", {
        count: updated.length,
      });
    }
  } catch (err) {
    // La BD puede no estar lista aún (migraciones corren antes del server).
    log.error("limpieza de corridas huérfanas falló", { err });
  }
}
