import { cookies } from "next/headers";
import { AparienciaClient } from "@/components/settings/apariencia-client";
import { EsperandoCard } from "@/components/settings/esperando-card";
import { getSessionOrNull } from "@/lib/auth/session";
import { canConfigure } from "@/lib/auth/roles";
import { avisoEsperandoDeCookie, ESPERANDO_COOKIE } from "@/lib/esperando";
import { aparienciaActual } from "@/server/apariencia";

export const dynamic = "force-dynamic";

/**
 * 062 — Ajustes → Apariencia: la ve todo el equipo; el predeterminado, quien
 * configura. 077 — Debajo, lo que cada persona ve cuando un cliente espera.
 */
export default async function AparienciaPage() {
  const session = await getSessionOrNull();
  const { apariencia, propia, delNegocio } = await aparienciaActual(session?.organizationId);
  const esperando = avisoEsperandoDeCookie((await cookies()).get(ESPERANDO_COOKIE)?.value);
  return (
    <div className="space-y-6">
      <AparienciaClient
        inicial={apariencia}
        propia={propia}
        delNegocio={delNegocio}
        puedeConfigurar={canConfigure(session?.role)}
      />
      <div className="max-w-3xl">
        <EsperandoCard inicial={esperando} />
      </div>
    </div>
  );
}
