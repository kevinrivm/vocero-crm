import { isVoceroName } from "@/lib/brand";
import { DEFAULT_BRANDING } from "@/lib/branding";
import { getBranding } from "@/server/branding";
import { enabledChannels } from "@/server/channels/enabled";
import { productName } from "@/lib/channels";
import { BrandLogo } from "@/components/brand-mark";

/**
 * Pantalla de entrada del CRM: papel frío y rejilla técnica discreta. Una
 * instancia white-label ve su nombre y una descripción neutra.
 */
export default async function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const branding = await getBranding().catch(() => DEFAULT_BRANDING);
  const vocero = isVoceroName(branding.name);
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-subtle p-4">
      <div className="brand-grid absolute inset-0" aria-hidden />
      <div className="brand-glow brand-glow-a" aria-hidden />
      <div className="brand-glow brand-glow-b" aria-hidden />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <BrandLogo branding={branding} size="lg" />
          {vocero ? (
            <h1 className="text-[21px] font-bold leading-tight tracking-[-0.025em]">
              El CRM{" "}
              <span
                className="bg-clip-text font-semibold text-transparent"
                style={{
                  backgroundImage:
                    "linear-gradient(92deg, var(--accent) 12%, #008d96 88%)",
                }}
              >
                que es tuyo.
              </span>
            </h1>
          ) : (
            <div>
              <h1 className="sr-only">{branding.name}</h1>
              <p className="text-sm text-text-3">
                {productName([...enabledChannels()])} con agente de IA
              </p>
            </div>
          )}
        </div>
        {children}
      </div>
    </main>
  );
}
