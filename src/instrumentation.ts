/**
 * Hook de arranque de Next. El trabajo real vive en instrumentation-node.ts
 * (import dinámico condicionado al runtime para que el bundler edge no
 * intente resolver dependencias de Node como `postgres`).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const {
      checkMediaDir,
      cleanupOrphanRuns,
      encryptLegacySecrets,
      ensureInternalMessageColumns,
      ensureStickyNoteTable,
      ensureCalendarIntegrationTable,
      ensureTenantRolePermissionTable,
      resumeDispatch,
      resumeWebhooks,
    } = await import("./instrumentation-node");
    await checkMediaDir();
    await cleanupOrphanRuns();
    await encryptLegacySecrets();
    await ensureInternalMessageColumns();
    await ensureStickyNoteTable();
    await ensureCalendarIntegrationTable();
    await ensureTenantRolePermissionTable();
    resumeDispatch();
    resumeWebhooks();
  }
}
