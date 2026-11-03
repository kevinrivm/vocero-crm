import { eq, and } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

export type CalendarProvider = "google" | "microsoft";

/**
 * Obtiene la URL base de redirección de callbacks
 */
function getBaseRedirectUri(): string {
  if (process.env.CALENDAR_REDIRECT_URI) {
    return process.env.CALENDAR_REDIRECT_URI.replace(/\/+$/, "");
  }
  const appBase = process.env.APP_BASE_URL || "http://localhost:3000";
  return `${appBase.replace(/\/+$/, "")}/api/calendar/callback`;
}

/**
 * Retorna la configuración OAuth para cada proveedor
 */
export function getOAuthConfig(provider: CalendarProvider) {
  const baseRedirect = getBaseRedirectUri();
  if (provider === "google") {
    return {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      redirectUri: `${baseRedirect}/google`,
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      userInfoUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
      scopes: [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/calendar.events",
      ].join(" "),
    };
  }

  return {
    clientId: process.env.MICROSOFT_CLIENT_ID || "",
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET || "",
    redirectUri: `${baseRedirect}/microsoft`,
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    userInfoUrl: "https://graph.microsoft.com/v1.0/me",
    scopes: [
      "openid",
      "email",
      "profile",
      "offline_access",
      "Calendars.ReadWrite",
      "OnlineMeetings.ReadWrite",
      "User.Read",
    ].join(" "),
  };
}

/**
 * Genera el estado (state) seguro codificado en base64
 */
export function encodeOAuthState(data: { orgId: string; provider: CalendarProvider; returnTo?: string }) {
  return Buffer.from(JSON.stringify(data)).toString("base64url");
}

/**
 * Decodifica el estado (state)
 */
export function decodeOAuthState(stateString: string): { orgId: string; provider: CalendarProvider; returnTo?: string } | null {
  try {
    const raw = Buffer.from(stateString, "base64url").toString("utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Construye la URL de autorización hacia Google o Microsoft
 */
export function buildAuthorizationUrl(
  provider: CalendarProvider,
  organizationId: string,
  returnTo?: string
): { url?: string; error?: string } {
  const config = getOAuthConfig(provider);

  if (!config.clientId) {
    return {
      error: `Falta configurar ${provider === "google" ? "GOOGLE_CLIENT_ID" : "MICROSOFT_CLIENT_ID"} en las variables de entorno.`,
    };
  }

  const state = encodeOAuthState({ orgId: organizationId, provider, returnTo });

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: config.scopes,
    state,
  });

  if (provider === "google") {
    params.set("access_type", "offline");
    params.set("prompt", "consent");
  } else {
    params.set("response_mode", "query");
    params.set("prompt", "select_account");
  }

  return { url: `${config.authUrl}?${params.toString()}` };
}

/**
 * Intercambia el código de autorización por tokens de acceso/refresh
 */
export async function exchangeOAuthCode(
  provider: CalendarProvider,
  code: string
): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  email?: string;
  name?: string;
  scope?: string;
}> {
  const config = getOAuthConfig(provider);

  const tokenParams = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
  });

  const tokenRes = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenParams.toString(),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text().catch(() => "");
    throw new Error(`Error al intercambiar código con ${provider}: ${tokenRes.status} ${errText}`);
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token as string;
  const refreshToken = (tokenData.refresh_token as string) || undefined;
  const expiresIn = typeof tokenData.expires_in === "number" ? tokenData.expires_in : undefined;
  const scope = (tokenData.scope as string) || undefined;

  // Consultar perfil de usuario
  let email: string | undefined;
  let name: string | undefined;

  try {
    const profileRes = await fetch(config.userInfoUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (profileRes.ok) {
      const profile = await profileRes.json();
      if (provider === "google") {
        email = profile.email;
        name = profile.name;
      } else {
        email = profile.mail || profile.userPrincipalName;
        name = profile.displayName;
      }
    }
  } catch {
    // Si falla el perfil, no bloquea el guardado del token
  }

  return {
    accessToken,
    refreshToken,
    expiresIn,
    email,
    name,
    scope,
  };
}

/**
 * Guarda o actualiza la integración en la base de datos
 */
export async function saveCalendarIntegration(params: {
  organizationId: string;
  provider: CalendarProvider;
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  email?: string;
  name?: string;
  scope?: string;
}): Promise<void> {
  const db = getDb();
  const now = new Date();
  const expiresAt = params.expiresIn ? new Date(now.getTime() + params.expiresIn * 1000) : null;

  const encAccess = encryptSecret(params.accessToken);
  const encRefresh = params.refreshToken ? encryptSecret(params.refreshToken) : null;

  // 1. Upsert en calendar_integration
  const [existing] = await db
    .select({ id: schema.calendarIntegration.id })
    .from(schema.calendarIntegration)
    .where(
      and(
        eq(schema.calendarIntegration.organizationId, params.organizationId),
        eq(schema.calendarIntegration.provider, params.provider)
      )
    )
    .limit(1);

  if (existing) {
    await db
      .update(schema.calendarIntegration)
      .set({
        accessTokenCipher: encAccess.cipher,
        accessTokenIv: encAccess.iv,
        accessTokenTag: encAccess.tag,
        ...(encRefresh
          ? {
              refreshTokenCipher: encRefresh.cipher,
              refreshTokenIv: encRefresh.iv,
              refreshTokenTag: encRefresh.tag,
            }
          : {}),
        expiresAt,
        accountEmail: params.email,
        accountName: params.name,
        scope: params.scope,
        status: "connected",
        updatedAt: now,
      })
      .where(eq(schema.calendarIntegration.id, existing.id));
  } else {
    await db.insert(schema.calendarIntegration).values({
      id: newId("calendarIntegration"),
      organizationId: params.organizationId,
      provider: params.provider,
      accessTokenCipher: encAccess.cipher,
      accessTokenIv: encAccess.iv,
      accessTokenTag: encAccess.tag,
      refreshTokenCipher: encRefresh?.cipher ?? null,
      refreshTokenIv: encRefresh?.iv ?? null,
      refreshTokenTag: encRefresh?.tag ?? null,
      expiresAt,
      accountEmail: params.email,
      accountName: params.name,
      scope: params.scope,
      status: "connected",
      createdAt: now,
      updatedAt: now,
    });
  }

  // 2. Si la organización tiene calendar_settings, actualizar su conector predeterminado
  try {
    const [calSettings] = await db
      .select({ id: schema.calendarSettings.id })
      .from(schema.calendarSettings)
      .where(eq(schema.calendarSettings.organizationId, params.organizationId))
      .limit(1);

    if (calSettings) {
      await db
        .update(schema.calendarSettings)
        .set({
          connector: params.provider,
          updatedAt: now,
        })
        .where(eq(schema.calendarSettings.id, calSettings.id));
    }
  } catch {
    // No bloquea si calendar_settings aún no existe
  }
}

/**
 * Consulta el estado de las integraciones de calendario de una organización
 */
export async function getCalendarIntegrationsStatus(organizationId: string): Promise<{
  activeProvider: CalendarProvider | null;
  google: { connected: boolean; email?: string | null; name?: string | null; connectedAt?: string };
  microsoft: { connected: boolean; email?: string | null; name?: string | null; connectedAt?: string };
}> {
  const db = getDb();

  const rows = await db
    .select({
      provider: schema.calendarIntegration.provider,
      status: schema.calendarIntegration.status,
      accountEmail: schema.calendarIntegration.accountEmail,
      accountName: schema.calendarIntegration.accountName,
      createdAt: schema.calendarIntegration.createdAt,
    })
    .from(schema.calendarIntegration)
    .where(eq(schema.calendarIntegration.organizationId, organizationId));

  const googleRow = rows.find((r) => r.provider === "google" && r.status === "connected");
  const microsoftRow = rows.find((r) => r.provider === "microsoft" && r.status === "connected");

  // Determinar conector activo desde calendar_settings
  let activeProvider: CalendarProvider | null = null;
  try {
    const [calSettings] = await db
      .select({ connector: schema.calendarSettings.connector })
      .from(schema.calendarSettings)
      .where(eq(schema.calendarSettings.organizationId, organizationId))
      .limit(1);

    if (calSettings?.connector === "google" && googleRow) {
      activeProvider = "google";
    } else if (calSettings?.connector === "microsoft" && microsoftRow) {
      activeProvider = "microsoft";
    } else if (googleRow) {
      activeProvider = "google";
    } else if (microsoftRow) {
      activeProvider = "microsoft";
    }
  } catch {
    if (googleRow) activeProvider = "google";
    else if (microsoftRow) activeProvider = "microsoft";
  }

  return {
    activeProvider,
    google: {
      connected: !!googleRow,
      email: googleRow?.accountEmail,
      name: googleRow?.accountName,
      connectedAt: googleRow?.createdAt?.toISOString(),
    },
    microsoft: {
      connected: !!microsoftRow,
      email: microsoftRow?.accountEmail,
      name: microsoftRow?.accountName,
      connectedAt: microsoftRow?.createdAt?.toISOString(),
    },
  };
}

/**
 * Desconecta un proveedor de calendario para una organización
 */
export async function disconnectCalendarIntegration(
  provider: CalendarProvider,
  organizationId: string
): Promise<void> {
  const db = getDb();
  await db
    .delete(schema.calendarIntegration)
    .where(
      and(
        eq(schema.calendarIntegration.organizationId, organizationId),
        eq(schema.calendarIntegration.provider, provider)
      )
    );

  // Revertir conector en calendar_settings a 'enlace-fijo'
  try {
    await db
      .update(schema.calendarSettings)
      .set({
        connector: "enlace-fijo",
        updatedAt: new Date(),
      })
      .where(eq(schema.calendarSettings.organizationId, organizationId));
  } catch {
    // Ignorar si no existe
  }
}

