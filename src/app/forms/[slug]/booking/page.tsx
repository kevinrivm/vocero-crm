import { notFound } from "next/navigation";
import { PublicBookingForm } from "@/components/public-forms/booking-form";
import { agendaEnabled } from "@/server/agenda/flag";
import { getSettings } from "@/server/agenda/settings";
import { todayInTz, addDaysISO } from "@/lib/time/slots";
import { getPublicFormForSlug } from "@/server/public-forms/service";
import { getBranding } from "@/server/branding";
import { resolveAccentSet } from "@/lib/branding";
import { resolvePublicFormConfig } from "@/lib/public-form-config";

export const dynamic = "force-dynamic";

export default async function PublicBookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!agendaEnabled()) notFound();
  const form = await getPublicFormForSlug(slug, "booking");
  if (!form) notFound();
  const [settings, branding] = await Promise.all([
    getSettings(form.organizationId),
    getBranding(form.organizationId),
  ]);
  const today = todayInTz(new Date(), settings.timezone);
  return (
    <PublicBookingForm
      slug={slug}
      organizationName={branding.name}
      accent={resolveAccentSet(branding.accent, "light")}
      today={today}
      maxDate={addDaysISO(today, settings.maxDaysAhead)}
      config={resolvePublicFormConfig(form.bookingFormConfig, "booking")}
    />
  );
}
