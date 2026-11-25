import { apiError } from "@/lib/api";
import { addDaysISO, dayLabelInTz, dayIsoInTz, timeInTz, todayInTz } from "@/lib/time/slots";
import { parseRangeQuery } from "@/lib/time/calendar";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { agendaEnabled } from "@/server/agenda/flag";
import { computeAvailability } from "@/server/agenda/availability";
import { getSettings } from "@/server/agenda/settings";
import { resolveWidgetAccess, widgetOptions, withWidgetCors } from "@/server/public-forms/cors";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function GET(req: Request, ctx: Params) {
  if (!agendaEnabled()) return apiError(404, "not_found", "Agenda no disponible");
  const { slug } = await ctx.params;
  const access = await resolveWidgetAccess(req, slug, "booking");
  if ("response" in access) return access.response;
  const { form, headers } = access.access;
  const rate = checkRateLimit(`public-availability:${slug}:${clientIp(req.headers)}`, {
    windowMs: 10 * 60_000,
    max: 120,
  });
  if (!rate.allowed) return withWidgetCors(apiError(429, "rate_limited", "Inténtalo de nuevo más tarde"), headers);

  const settings = await getSettings(form.organizationId);
  const now = new Date();
  const today = todayInTz(now, settings.timezone);
  const url = new URL(req.url);
  const date = url.searchParams.get("date")?.trim() || today;
  const parsed = parseRangeQuery(date, date);
  if (!parsed.ok || !parsed.range) {
    return withWidgetCors(apiError(422, "invalid_date", "Selecciona una fecha válida"), headers);
  }
  if (date < today || date > addDaysISO(today, settings.maxDaysAhead)) {
    return withWidgetCors(
      apiError(422, "date_out_of_range", "La fecha está fuera del periodo reservable"),
      headers
    );
  }
  const slots = await computeAvailability(form.organizationId, {
    fromISO: date,
    toISO: date,
    settings,
    now,
  });
  return withWidgetCors(Response.json({
    timezone: settings.timezone,
    today,
    maxDate: addDaysISO(today, settings.maxDaysAhead),
    date,
    slots: slots.map((slot) => ({
      ...slot,
      dayIso: dayIsoInTz(new Date(slot.startUtc), settings.timezone),
      dayLabel: dayLabelInTz(slot.startUtc, settings.timezone, now),
      time: timeInTz(slot.startUtc, settings.timezone),
    })),
  }), headers);
}

export async function OPTIONS(req: Request, ctx: Params) {
  if (!agendaEnabled()) return apiError(404, "not_found", "Agenda no disponible");
  const { slug } = await ctx.params;
  return widgetOptions(req, slug, "booking");
}
