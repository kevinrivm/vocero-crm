import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { rolPuede, rolVigente } from "@/server/api-v1/acceso";
import {
  hashToken,
  normalizar,
  nuevoToken,
  OAUTH_SCOPES,
  PREFIJO_ACCESO,
  PREFIJO_CODIGO,
  PREFIJO_REFRESCO,
  verificarPkce,
  VIDA_ACCESO_S,
  VIDA_CODIGO_MS,
  VIDA_REFRESCO_MS,
  type OAuthScope,
} from "./nucleo";

/**
 * 069 — Lo que el OAuth del MCP guarda y consulta.
 *
 * Toda función recibe la organización de la instancia (`negocioOAuth`) y
 * filtra por ella con `scoped()`. El token de acceso es la excepción a
 * propósito — `accesoPorValor` no mira la organización porque esa decisión
 * la toma la puerta de la API (`autenticarLlave`), igual que con las llaves.
 */

const db = () => getDb();

/** Tope de redirect_uris por cliente: ninguno legítimo necesita más. */
export const MAX_REDIRECTS = 10;

export async function registrarCliente(organizationId: string, name: string, redirectUris: string[]) {
  const [row] = await db()
    .insert(schema.oauthClient)
    .values({ id: newId("oauthClient"), organizationId, name, redirectUris })
    .returning();
  return row!;
}

export async function clienteDe(organizationId: string, clientId: string | null | undefined) {
  if (!clientId || clientId.length > 64) return null;
  const [row] = await db()
    .select()
    .from(schema.oauthClient)
    .where(scoped(schema.oauthClient.organizationId, organizationId, eq(schema.oauthClient.id, clientId)))
    .limit(1);
  return row ?? null;
}

/**
 * La persona aceptó: se crea (o se actualiza) su app conectada y se emite un
 * código de un solo uso. Volver a conectar el mismo cliente reusa la app y
 * deja los permisos de este último consentimiento.
 */
export async function emitirCodigo(input: {
  organizationId: string;
  clientId: string;
  userId: string;
  scopes: OAuthScope[];
  redirectUri: string;
  codeChallenge: string;
}): Promise<string> {
  const scopes = normalizar(input.scopes);
  return db().transaction(async (tx) => {
    const [existente] = await tx
      .select({ id: schema.oauthGrant.id })
      .from(schema.oauthGrant)
      .where(
        scoped(
          schema.oauthGrant.organizationId,
          input.organizationId,
          eq(schema.oauthGrant.clientId, input.clientId),
          eq(schema.oauthGrant.userId, input.userId),
          isNull(schema.oauthGrant.revokedAt)
        )
      )
      .limit(1);
    let grantId = existente?.id;
    if (grantId) {
      await tx.update(schema.oauthGrant).set({ scopes }).where(eq(schema.oauthGrant.id, grantId));
    } else {
      grantId = newId("oauthGrant");
      await tx.insert(schema.oauthGrant).values({
        id: grantId,
        organizationId: input.organizationId,
        clientId: input.clientId,
        userId: input.userId,
        scopes,
      });
    }
    const codigo = nuevoToken(PREFIJO_CODIGO);
    await tx.insert(schema.oauthToken).values({
      id: newId("oauthToken"),
      organizationId: input.organizationId,
      grantId,
      kind: "code",
      hash: codigo.hash,
      scopes,
      codeChallenge: input.codeChallenge,
      redirectUri: input.redirectUri,
      expiresAt: new Date(Date.now() + VIDA_CODIGO_MS),
    });
    return codigo.valor;
  });
}

export type Tokens = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
};

type Fallo = { error: "invalid_grant" | "invalid_request"; descripcion: string };

async function emitirPar(organizationId: string, grantId: string, scopes: string[]): Promise<Tokens> {
  const acceso = nuevoToken(PREFIJO_ACCESO);
  const refresco = nuevoToken(PREFIJO_REFRESCO);
  const ahora = Date.now();
  await db()
    .insert(schema.oauthToken)
    .values([
      {
        id: newId("oauthToken"),
        organizationId,
        grantId,
        kind: "access",
        hash: acceso.hash,
        scopes,
        expiresAt: new Date(ahora + VIDA_ACCESO_S * 1000),
      },
      {
        id: newId("oauthToken"),
        organizationId,
        grantId,
        kind: "refresh",
        hash: refresco.hash,
        scopes,
        expiresAt: new Date(ahora + VIDA_REFRESCO_MS),
      },
    ]);
  return {
    access_token: acceso.valor,
    token_type: "Bearer",
    expires_in: VIDA_ACCESO_S,
    refresh_token: refresco.valor,
    scope: scopes.join(" "),
  };
}

/** Revocar una app conectada: ella y todos sus tokens dejan de servir ya. */
export async function revocarGrant(organizationId: string, grantId: string): Promise<boolean> {
  return db().transaction(async (tx) => {
    const rows = await tx
      .update(schema.oauthGrant)
      .set({ revokedAt: new Date() })
      .where(
        scoped(schema.oauthGrant.organizationId, organizationId, eq(schema.oauthGrant.id, grantId), isNull(schema.oauthGrant.revokedAt))
      )
      .returning({ id: schema.oauthGrant.id });
    await tx
      .update(schema.oauthToken)
      .set({ revokedAt: new Date() })
      .where(scoped(schema.oauthToken.organizationId, organizationId, eq(schema.oauthToken.grantId, grantId), isNull(schema.oauthToken.revokedAt)));
    return rows.length > 0;
  });
}

/** Un token del tipo pedido, de esta organización, por su valor. */
async function tokenDe(organizationId: string, valor: string, kind: "code" | "refresh" | "access") {
  if (valor.length < 20 || valor.length > 120) return null;
  const [row] = await db()
    .select({ token: schema.oauthToken, grant: schema.oauthGrant })
    .from(schema.oauthToken)
    .innerJoin(schema.oauthGrant, eq(schema.oauthGrant.id, schema.oauthToken.grantId))
    .where(
      scoped(schema.oauthToken.organizationId, organizationId, eq(schema.oauthToken.hash, hashToken(valor)), eq(schema.oauthToken.kind, kind))
    )
    .limit(1);
  return row ?? null;
}

/** Gasta un código o un refresco: solo el primero que llegue lo consigue. */
async function gastar(id: string): Promise<boolean> {
  const rows = await db()
    .update(schema.oauthToken)
    .set({ usedAt: new Date() })
    .where(and(eq(schema.oauthToken.id, id), isNull(schema.oauthToken.usedAt)))
    .returning({ id: schema.oauthToken.id });
  return rows.length > 0;
}

/** Recorta los permisos a lo que la persona puede HOY. Sin acceso, null. */
async function permisosVigentes(userId: string, organizationId: string, scopes: readonly string[]) {
  const role = await rolVigente(userId, organizationId);
  if (!role) return null;
  return normalizar(scopes).filter((s) => rolPuede(role, s));
}

const invalido = (descripcion: string): Fallo => ({ error: "invalid_grant", descripcion });

/** `grant_type=authorization_code` con PKCE. */
export async function canjearCodigo(input: {
  organizationId: string;
  clientId: string;
  code: string;
  redirectUri: string;
  verifier: string;
}): Promise<Tokens | Fallo> {
  const fila = await tokenDe(input.organizationId, input.code, "code");
  if (!fila) return invalido("Código desconocido");
  const { token, grant } = fila;
  if (token.usedAt) {
    // Un código usado dos veces es un código robado: se tumba todo lo que emitió.
    await revocarGrant(input.organizationId, grant.id);
    return invalido("El código ya se usó");
  }
  if (!(await gastar(token.id))) return invalido("El código ya se usó");
  if (token.revokedAt || grant.revokedAt) return invalido("La autorización fue revocada");
  if (token.expiresAt.getTime() < Date.now()) return invalido("El código caducó");
  if (grant.clientId !== input.clientId) return invalido("El código es de otro cliente");
  if (token.redirectUri !== input.redirectUri) return invalido("redirect_uri no coincide");
  if (!token.codeChallenge || !verificarPkce(input.verifier, token.codeChallenge)) {
    return invalido("code_verifier no coincide (PKCE)");
  }
  const scopes = await permisosVigentes(grant.userId, input.organizationId, token.scopes);
  if (!scopes) return invalido("Quien autorizó ya no tiene acceso a este negocio");
  return emitirPar(input.organizationId, grant.id, scopes);
}

/** Margen para dos refrescos simultáneos del mismo cliente antes de tratarlo como robo. */
const GRACIA_REUSO_MS = 60_000;

/** `grant_type=refresh_token`: rota (el viejo deja de servir) y recorta permisos. */
export async function refrescar(input: {
  organizationId: string;
  clientId: string;
  refresh: string;
  scope?: string | null;
}): Promise<Tokens | Fallo> {
  const fila = await tokenDe(input.organizationId, input.refresh, "refresh");
  if (!fila) return invalido("Refresh token desconocido");
  const { token, grant } = fila;
  if (grant.clientId !== input.clientId) return invalido("El refresh token es de otro cliente");
  if (token.usedAt) {
    if (Date.now() - token.usedAt.getTime() > GRACIA_REUSO_MS) await revocarGrant(input.organizationId, grant.id);
    return invalido("El refresh token ya se usó");
  }
  if (token.revokedAt || grant.revokedAt) return invalido("La autorización fue revocada");
  if (token.expiresAt.getTime() < Date.now()) return invalido("El refresh token caducó");
  if (!(await gastar(token.id))) return invalido("El refresh token ya se usó");
  // Se puede pedir menos, nunca más de lo concedido.
  let scopes: string[] = token.scopes.filter((s) => grant.scopes.includes(s));
  if (input.scope) {
    const pedidos = input.scope.split(/\s+/);
    if (pedidos.some((s) => !scopes.includes(s))) return { error: "invalid_request", descripcion: "scope mayor al concedido" };
    scopes = normalizar(pedidos);
  }
  const vigentes = await permisosVigentes(grant.userId, input.organizationId, scopes);
  if (!vigentes) return invalido("Quien autorizó ya no tiene acceso a este negocio");
  // El acceso viejo de este grant se apaga: un refresco deja un solo par vivo.
  await db()
    .update(schema.oauthToken)
    .set({ revokedAt: new Date() })
    .where(
      scoped(
        schema.oauthToken.organizationId,
        input.organizationId,
        eq(schema.oauthToken.grantId, grant.id),
        eq(schema.oauthToken.kind, "access"),
        isNull(schema.oauthToken.revokedAt)
      )
    );
  return emitirPar(input.organizationId, grant.id, vigentes);
}

/**
 * RFC 7009. Revocar un refresco desconecta la app entera; un acceso, solo
 * ese token. Un valor desconocido (o de otro negocio) no es error.
 */
export async function revocarToken(organizationId: string, valor: string, clientId?: string | null): Promise<void> {
  for (const kind of ["refresh", "access"] as const) {
    const fila = await tokenDe(organizationId, valor, kind);
    if (!fila) continue;
    if (clientId && fila.grant.clientId !== clientId) return;
    if (kind === "refresh") await revocarGrant(organizationId, fila.grant.id);
    else await db().update(schema.oauthToken).set({ revokedAt: new Date() }).where(eq(schema.oauthToken.id, fila.token.id));
    return;
  }
}

/**
 * El token de acceso vivo de un valor, con su app. NO mira la organización:
 * eso lo decide `autenticarLlave`, igual que con las llaves.
 */
export async function accesoPorValor(valor: string) {
  if (!valor.startsWith(PREFIJO_ACCESO) || valor.length < 40 || valor.length > 120) return null;
  const [row] = await db()
    .select({ token: schema.oauthToken, grant: schema.oauthGrant, client: schema.oauthClient })
    .from(schema.oauthToken)
    .innerJoin(schema.oauthGrant, eq(schema.oauthGrant.id, schema.oauthToken.grantId))
    .innerJoin(schema.oauthClient, eq(schema.oauthClient.id, schema.oauthGrant.clientId))
    .where(
      and(
        eq(schema.oauthToken.hash, hashToken(valor)),
        eq(schema.oauthToken.kind, "access"),
        isNull(schema.oauthToken.revokedAt),
        isNull(schema.oauthGrant.revokedAt),
        gt(schema.oauthToken.expiresAt, new Date())
      )
    )
    .limit(1);
  if (!row || row.token.organizationId !== row.grant.organizationId) return null;
  return row;
}

export async function registrarUsoGrant(grantId: string) {
  await db()
    .update(schema.oauthGrant)
    .set({ lastUsedAt: new Date(), requestCount: sql`${schema.oauthGrant.requestCount} + 1` })
    .where(eq(schema.oauthGrant.id, grantId))
    .catch((err) => console.error("[oauth] no se pudo registrar el uso:", err));
}

export type AppConectada = {
  id: string;
  clientName: string;
  redirectHost: string;
  user: { name: string; email: string };
  scopes: OAuthScope[];
  createdAt: string;
  lastUsedAt: string | null;
  requestCount: number;
};

function hostDe(uri: string | undefined): string {
  try {
    return uri ? new URL(uri).host || new URL(uri).protocol : "";
  } catch {
    return "";
  }
}

/** Ajustes → API → Apps conectadas: las vivas de este negocio. */
export async function listarApps(organizationId: string): Promise<AppConectada[]> {
  const rows = await db()
    .select({ grant: schema.oauthGrant, client: schema.oauthClient, user: { name: schema.user.name, email: schema.user.email } })
    .from(schema.oauthGrant)
    .innerJoin(schema.oauthClient, eq(schema.oauthClient.id, schema.oauthGrant.clientId))
    .innerJoin(schema.user, eq(schema.user.id, schema.oauthGrant.userId))
    .where(scoped(schema.oauthGrant.organizationId, organizationId, isNull(schema.oauthGrant.revokedAt)))
    .orderBy(desc(schema.oauthGrant.createdAt));
  // Una app que nunca canjeó su código (la persona aceptó y el cliente no
  // terminó) no está conectada de verdad: no se lista.
  const conTokens = rows.length
    ? new Set(
        (
          await db()
            .selectDistinct({ grantId: schema.oauthToken.grantId })
            .from(schema.oauthToken)
            .where(
              scoped(
                schema.oauthToken.organizationId,
                organizationId,
                eq(schema.oauthToken.kind, "refresh"),
                inArray(schema.oauthToken.grantId, rows.map((r) => r.grant.id))
              )
            )
        ).map((r) => r.grantId)
      )
    : new Set<string>();
  return rows
    .filter((r) => conTokens.has(r.grant.id))
    .map((r) => ({
      id: r.grant.id,
      clientName: r.client.name,
      redirectHost: hostDe(r.client.redirectUris[0]),
      user: r.user,
      scopes: r.grant.scopes.filter((s): s is OAuthScope => (OAUTH_SCOPES as readonly string[]).includes(s)),
      createdAt: r.grant.createdAt.toISOString(),
      lastUsedAt: r.grant.lastUsedAt?.toISOString() ?? null,
      requestCount: r.grant.requestCount,
    }));
}
