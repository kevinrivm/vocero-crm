import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  challengeValido,
  metadatosRecurso,
  metadatosServidor,
  normalizar,
  nuevoToken,
  parsearScopes,
  PREFIJO_ACCESO,
  recursoValido,
  redirectCoincide,
  redirectRegistrable,
  siguienteSeguro,
  urlDeRegreso,
  urlMetadatosRecurso,
  verificarPkce,
} from "@/server/oauth/nucleo";

/**
 * 069 — Las piezas puras del OAuth del MCP. El camino completo (registro,
 * consentimiento, token, MCP) lo prueba `scripts/e2e-api-mcp.mjs` con
 * la app viva; aquí, que cada regla diga lo que dice.
 */

const ORIGEN = "https://crm.negocio.test";

describe("PKCE S256", () => {
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  it("acepta el verifier que corresponde", () => {
    expect(challengeValido(challenge)).toBe(true);
    expect(verificarPkce(verifier, challenge)).toBe(true);
  });
  it("rechaza otro verifier, uno corto o `plain`", () => {
    expect(verificarPkce(`${verifier.slice(0, -1)}A`, challenge)).toBe(false);
    expect(verificarPkce("corto", challenge)).toBe(false);
    expect(verificarPkce(verifier, verifier)).toBe(false);
    expect(challengeValido("x")).toBe(false);
  });
});

describe("scopes", () => {
  it("sin scope o con uno desconocido se piden todos", () => {
    expect(parsearScopes(undefined)).toEqual(["read", "operate", "configure"]);
    expect(parsearScopes("openid profile")).toEqual(["read", "operate", "configure"]);
  });
  it("leer va siempre y `send` no existe por OAuth", () => {
    expect(parsearScopes("configure")).toEqual(["read", "configure"]);
    expect(parsearScopes("send operate")).toEqual(["read", "operate"]);
    expect(normalizar(["send"])).toEqual(["read"]);
  });
});

describe("redirect_uri", () => {
  it("registra https, loopback http y esquemas de app; no http público ni javascript", () => {
    expect(redirectRegistrable("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(redirectRegistrable("http://localhost:53682/callback")).toBe(true);
    expect(redirectRegistrable("http://127.0.0.1/callback")).toBe(true);
    expect(redirectRegistrable("cursor://anysphere.cursor-retrieval/oauth/callback")).toBe(true);
    expect(redirectRegistrable("http://evil.example/callback")).toBe(false);
    expect(redirectRegistrable("javascript:alert(1)")).toBe(false);
    expect(redirectRegistrable("https://claude.ai/cb#x")).toBe(false);
    expect(redirectRegistrable("no es url")).toBe(false);
  });
  it("coincide exacto; en loopback el puerto puede cambiar (RFC 8252)", () => {
    const reg = ["https://claude.ai/api/mcp/auth_callback", "http://localhost:3118/callback"];
    expect(redirectCoincide(reg, "https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(redirectCoincide(reg, "http://localhost:61000/callback")).toBe(true);
    expect(redirectCoincide(reg, "http://localhost:61000/otra")).toBe(false);
    expect(redirectCoincide(reg, "https://claude.ai/api/mcp/auth_callback/../x")).toBe(false);
    expect(redirectCoincide(reg, "https://evil.example/api/mcp/auth_callback")).toBe(false);
  });
  it("la URL de regreso conserva su query y suma code, state e iss", () => {
    const u = new URL(urlDeRegreso("https://app.example/cb?x=1", { code: "c", state: "s", iss: ORIGEN, error: undefined }));
    expect(Object.fromEntries(u.searchParams)).toEqual({ x: "1", code: "c", state: "s", iss: ORIGEN });
  });
});

describe("metadatos", () => {
  it("el recurso es el MCP y su servidor de autorización es la propia instancia", () => {
    const r = metadatosRecurso(ORIGEN);
    expect(r.resource).toBe(`${ORIGEN}/api/v1/mcp`);
    expect(r.authorization_servers).toEqual([ORIGEN]);
    expect(urlMetadatosRecurso(ORIGEN)).toBe(`${ORIGEN}/.well-known/oauth-protected-resource/api/v1/mcp`);
  });
  it("el servidor anuncia PKCE S256, registro dinámico, revocación y clientes públicos", () => {
    const s = metadatosServidor(ORIGEN);
    expect(s.issuer).toBe(ORIGEN);
    expect(s.code_challenge_methods_supported).toEqual(["S256"]);
    expect(s.token_endpoint_auth_methods_supported).toEqual(["none"]);
    expect(s.registration_endpoint).toBe(`${ORIGEN}/api/oauth/register`);
    expect(s.revocation_endpoint).toBe(`${ORIGEN}/api/oauth/revoke`);
    expect(s.authorization_endpoint).toBe(`${ORIGEN}/oauth/authorize`);
  });
  it("resource: el MCP, el origen o nada; otro servidor no", () => {
    expect(recursoValido(ORIGEN, undefined)).toBe(true);
    expect(recursoValido(ORIGEN, `${ORIGEN}/api/v1/mcp`)).toBe(true);
    expect(recursoValido(ORIGEN, `${ORIGEN}/`)).toBe(true);
    expect(recursoValido(ORIGEN, "https://otra.vocerocrm.com/api/v1/mcp")).toBe(false);
  });
});

describe("tokens y login", () => {
  it("un token nuevo lleva su prefijo y se guarda por hash", () => {
    const t = nuevoToken(PREFIJO_ACCESO);
    expect(t.valor.startsWith("vat_")).toBe(true);
    expect(t.hash).toBe(createHash("sha256").update(t.valor).digest("hex"));
    expect(nuevoToken(PREFIJO_ACCESO).valor).not.toBe(t.valor);
  });
  it("el login solo vuelve a la pantalla de consentimiento, nunca a otro sitio", () => {
    expect(siguienteSeguro("/oauth/authorize?client_id=vc_1")).toBe("/oauth/authorize?client_id=vc_1");
    expect(siguienteSeguro("https://evil.example")).toBeNull();
    expect(siguienteSeguro("//evil.example/oauth/authorize?")).toBeNull();
    expect(siguienteSeguro("/oauth/authorize?x=//evil")).toBeNull();
    expect(siguienteSeguro("/inbox")).toBeNull();
    expect(siguienteSeguro(["/oauth/authorize?a"])).toBeNull();
  });
});
