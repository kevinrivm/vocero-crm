import { AparienciaClient } from "@/components/settings/apariencia-client";
import { getSessionOrNull } from "@/lib/auth/session";
import { canConfigure } from "@/lib/auth/roles";
import { aparienciaActual } from "@/server/apariencia";

export const dynamic = "force-dynamic";

/** 062 — Ajustes → Apariencia: la ve todo el equipo; el predeterminado, quien configura. */
export default async function AparienciaPage() {
  const session = await getSessionOrNull();
  const { apariencia, propia, delNegocio } = await aparienciaActual(session?.organizationId);
  return (
    <AparienciaClient
      inicial={apariencia}
      propia={propia}
      delNegocio={delNegocio}
      puedeConfigurar={canConfigure(session?.role)}
    />
  );
}
