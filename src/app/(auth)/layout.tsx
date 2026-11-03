import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Nexia",
  description: "El CRM inteligente con Agente IA",
};

/**
 * Layout de autenticación oficial de Nexia:
 * Mantiene el fondo y contenedor centrados,
 * sin importar los datos de organizaciones o configuraciones de marca blanca de tenants.
 */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-[#0F4C5C]/20 via-background to-[#3E2723]/20 p-4">
      <div className="brand-grid absolute inset-0 opacity-40" aria-hidden />
      <div className="brand-glow brand-glow-a" aria-hidden />
      <div className="brand-glow brand-glow-b" aria-hidden />

      <div className="relative w-full max-w-sm">{children}</div>
    </main>
  );
}
