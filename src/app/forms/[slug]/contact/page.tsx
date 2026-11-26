import { notFound } from "next/navigation";
import { PublicContactForm } from "@/components/public-forms/contact-form";
import { resolveAccentSet } from "@/lib/branding";
import { getBranding } from "@/server/branding";
import { getPublicFormForSlug } from "@/server/public-forms/service";
import { resolvePublicFormConfig } from "@/lib/public-form-config";

export const dynamic = "force-dynamic";

export default async function PublicContactPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const form = await getPublicFormForSlug(slug, "contact");
  if (!form) notFound();
  const branding = await getBranding(form.organizationId);
  return <PublicContactForm slug={slug} organizationName={branding.name} accent={resolveAccentSet(branding.accent, "light")} config={resolvePublicFormConfig(form.contactFormConfig, "contact")} />;
}
