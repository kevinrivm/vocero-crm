import { apiError } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { normalizeAllowedOrigin } from "@/lib/public-form-config";
import {
  getPublicFormForSlug,
  type PublicFormKind,
} from "@/server/public-forms/service";

type WidgetAccess = {
  form: NonNullable<Awaited<ReturnType<typeof getPublicFormForSlug>>>;
  headers: Headers;
};

export async function resolveWidgetAccess(
  req: Request,
  slug: string,
  kind: PublicFormKind
): Promise<{ access: WidgetAccess } | { response: Response }> {
  const form = await getPublicFormForSlug(slug, kind);
  if (!form) {
    return { response: apiError(404, "not_found", "Formulario no disponible") };
  }

  const headers = new Headers({ Vary: "Origin" });
  const origin = req.headers.get("origin");
  if (!origin) return { access: { form, headers } };

  const candidate = normalizeAllowedOrigin(origin);
  const requestOrigin = new URL(req.url).origin;
  const configuredOrigin = normalizeAllowedOrigin(getEnv().APP_BASE_URL);
  const isVoceroOrigin = candidate !== null &&
    (candidate === requestOrigin || candidate === configuredOrigin);
  const isAllowedEmbed = candidate !== null && form.allowedOrigins.includes(candidate);
  if (!isVoceroOrigin && !isAllowedEmbed) {
    return {
      response: apiError(403, "origin_not_allowed", "Este sitio no está autorizado para usar el widget"),
    };
  }

  headers.set("Access-Control-Allow-Origin", candidate!);
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Access-Control-Max-Age", "600");
  return { access: { form, headers } };
}

export async function widgetOptions(
  req: Request,
  slug: string,
  kind: PublicFormKind
) {
  const result = await resolveWidgetAccess(req, slug, kind);
  if ("response" in result) return result.response;
  return new Response(null, { status: 204, headers: result.access.headers });
}

export function withWidgetCors(response: Response, corsHeaders: Headers) {
  const headers = new Headers(response.headers);
  corsHeaders.forEach((value, key) => headers.set(key, value));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
