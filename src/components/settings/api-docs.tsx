import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Ajustes → API → Documentación. Se dibuja a partir del mismo OpenAPI que sirve
 * `/api/v1/openapi.json`: la página no puede contar algo distinto de lo que la
 * API hace, porque los dos salen del mismo archivo (y una prueba unitaria
 * exige que ese archivo liste exactamente las rutas del código).
 */

type Schema = {
  type?: string | string[];
  format?: string;
  enum?: unknown[];
  const?: unknown;
  description?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  oneOf?: Schema[];
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
};
type Param = { name?: string; in?: string; required?: boolean; description?: string; schema?: Schema; $ref?: string };
type Operation = {
  summary?: string;
  description?: string;
  security?: unknown[];
  parameters?: Param[];
  requestBody?: { content?: Record<string, { schema?: Schema }> };
  responses?: Record<string, { description?: string; $ref?: string }>;
};
type Spec = {
  info: { title: string; version: string; description: string };
  paths: Record<string, Record<string, Operation | Param[]>>;
  components?: { parameters?: Record<string, Param> };
};

const VERBOS = ["get", "post", "patch", "put", "delete"] as const;

/** `código` y **negritas**, lo único que usa el texto del contrato. */
function enLinea(texto: string): ReactNode[] {
  return texto.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((t, i) => {
    if (t.startsWith("`") && t.endsWith("`")) {
      return (
        <code key={i} className="rounded bg-subtle px-1 py-0.5 font-mono text-[12.5px]">
          {t.slice(1, -1)}
        </code>
      );
    }
    if (t.startsWith("**") && t.endsWith("**")) return <strong key={i}>{t.slice(2, -2)}</strong>;
    return <Fragment key={i}>{t}</Fragment>;
  });
}

function tipoDe(s: Schema | undefined): string {
  if (!s) return "";
  if (s.const !== undefined) return JSON.stringify(s.const);
  if (s.enum) return s.enum.filter((e) => e !== null).map((e) => JSON.stringify(e)).join(" | ");
  const t = Array.isArray(s.type) ? s.type.join(" | ") : (s.type ?? "");
  if (t === "array" && s.items) return `${tipoDe(s.items)}[]`;
  return s.format ? `${t} (${s.format})` : t;
}

function restricciones(s: Schema): string {
  const r: string[] = [];
  if (s.maxLength !== undefined) r.push(`máx. ${s.maxLength} caracteres`);
  if (s.minimum !== undefined) r.push(`mín. ${s.minimum}`);
  if (s.maximum !== undefined) r.push(`máx. ${s.maximum}`);
  if (s.pattern) r.push(`patrón ${s.pattern}`);
  return r.join(", ");
}

function Campos({ schema }: { schema: Schema }) {
  const props = Object.entries(schema.properties ?? {});
  if (props.length === 0) return null;
  const req = new Set(schema.required ?? []);
  return (
    <table className="w-full text-left text-[13px]">
      <tbody>
        {props.map(([nombre, s]) => (
          <tr key={nombre} className="border-t align-top">
            <td className="py-1.5 pr-3 font-mono font-semibold">
              {nombre}
              {req.has(nombre) && <span className="ml-1 text-destructive">*</span>}
            </td>
            <td className="py-1.5 pr-3 font-mono text-text-2">{tipoDe(s)}</td>
            <td className="py-1.5 text-text-2">
              {[s.description, restricciones(s)].filter(Boolean).join(". ")}
              {s.properties && (
                <div className="mt-1 rounded border p-2">
                  <Campos schema={s} />
                </div>
              )}
              {s.items?.properties && (
                <div className="mt-1 rounded border p-2">
                  <Campos schema={s.items} />
                </div>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Un cuerpo de ejemplo con los campos obligatorios, para el `curl`. */
function ejemplo(s: Schema | undefined): unknown {
  if (!s) return undefined;
  if (s.oneOf?.[0]) return ejemplo(s.oneOf[0]);
  if (s.const !== undefined) return s.const;
  if (s.enum) return s.enum.find((e) => e !== null);
  const t = Array.isArray(s.type) ? s.type.find((x) => x !== "null") : s.type;
  if (t === "object" || s.properties) {
    const req = s.required ?? [];
    return Object.fromEntries(
      Object.entries(s.properties ?? {})
        .filter(([k]) => req.includes(k))
        .map(([k, v]) => [k, ejemplo(v)])
    );
  }
  if (t === "array") return [ejemplo(s.items)];
  if (t === "integer" || t === "number") return 0;
  if (t === "boolean") return true;
  if (s.format === "date") return "2026-11-04";
  if (s.format === "date-time") return "2026-11-04T16:00:00Z";
  return s.pattern ? "5215512345678" : "texto";
}

function curl(base: string, verbo: string, path: string, op: Operation): string {
  const conLlave = op.security === undefined || op.security.length > 0;
  const linea = [`curl -X ${verbo.toUpperCase()} "${base}${path}"`];
  if (conLlave) linea.push(`  -H "Authorization: Bearer $VOCERO_API_KEY"`);
  const schema = op.requestBody?.content?.["application/json"]?.schema;
  if (schema) {
    linea.push(`  -H "Content-Type: application/json"`);
    linea.push(`  -d '${JSON.stringify(ejemplo(schema))}'`);
  }
  return linea.join(" \\\n");
}

function permiso(op: Operation): string | null {
  if (op.security && op.security.length === 0) return "sin llave";
  return /Permiso: (\w+)/.exec(op.description ?? "")?.[1] ?? null;
}

export function ApiDocs({ spec: contrato, base }: { spec: unknown; base: string }) {
  // El JSON importado tiene un tipo literal por cada ruta; aquí basta su forma.
  const spec = contrato as Spec;
  const params = spec.components?.parameters ?? {};
  const resolver = (p: Param): Param => (p.$ref ? (params[p.$ref.split("/").pop() ?? ""] ?? p) : p);
  const parrafos = spec.info.description.split(/\n\n+/);

  return (
    <div className="max-w-4xl space-y-6">
      <p className="text-sm">
        <Link href="/settings/api" className="font-semibold text-brand-ink hover:underline">
          ← Volver a las llaves
        </Link>
      </p>
      <Card>
        <CardHeader>
          <CardTitle>Documentación de la API</CardTitle>
          <CardDescription>
            URL base de este negocio: <span className="break-all font-mono">{base}</span> · versión{" "}
            {spec.info.version} ·{" "}
            <a href="/api/v1/openapi.json" className="font-semibold text-brand-ink hover:underline" target="_blank" rel="noreferrer">
              OpenAPI (JSON)
            </a>{" "}
            para importar en Postman, n8n o un agente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed">
          {parrafos.map((p, i) => (
            <p key={i}>{enLinea(p)}</p>
          ))}
        </CardContent>
      </Card>

      <nav aria-label="Rutas" className="rounded-md border p-3 text-[13px]">
        <p className="mb-2 font-semibold">Rutas</p>
        <ul className="grid gap-1 sm:grid-cols-2">
          {Object.entries(spec.paths).flatMap(([path, ops]) =>
            VERBOS.filter((v) => v in ops).map((v) => (
              <li key={`${v} ${path}`}>
                <a href={`#${v}-${path}`} className="hover:underline">
                  <span className="inline-block w-14 font-mono font-semibold uppercase">{v}</span>
                  <span className="font-mono">{path}</span>
                </a>
              </li>
            ))
          )}
        </ul>
      </nav>

      {Object.entries(spec.paths).map(([path, ops]) => {
        const comunes = ((ops as Record<string, unknown>).parameters as Param[] | undefined) ?? [];
        return VERBOS.filter((v) => v in ops).map((v) => {
          const op = ops[v] as Operation;
          const todos = [...comunes, ...(op.parameters ?? [])].map(resolver);
          const cuerpo = op.requestBody?.content?.["application/json"]?.schema;
          const variantes = cuerpo?.oneOf ?? (cuerpo ? [cuerpo] : []);
          const quien = permiso(op);
          return (
            <Card key={`${v} ${path}`} id={`${v}-${path}`} className="scroll-mt-4">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 font-mono text-[15px]">
                  <span className="rounded bg-brand-tint px-1.5 py-0.5 text-[12px] uppercase text-brand-text">{v}</span>
                  {path}
                  {quien && <span className="rounded border px-1.5 py-0.5 text-[11px] font-normal text-text-2">{quien}</span>}
                </CardTitle>
                <CardDescription>
                  <span className="font-semibold text-foreground">{op.summary}</span>
                  {op.description && (
                    <>
                      {" "}
                      — {enLinea(op.description.replace(/^Permiso: \w+\.\s*/, ""))}
                    </>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {todos.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase text-text-3">Parámetros</p>
                    <table className="w-full text-left text-[13px]">
                      <tbody>
                        {todos.map((p) => (
                          <tr key={`${p.in}-${p.name}`} className="border-t align-top">
                            <td className="py-1.5 pr-3 font-mono font-semibold">
                              {p.name}
                              {p.required && <span className="ml-1 text-destructive">*</span>}
                            </td>
                            <td className="py-1.5 pr-3 text-text-2">{p.in === "path" ? "en la ruta" : "en la URL"}</td>
                            <td className="py-1.5 pr-3 font-mono text-text-2">{tipoDe(p.schema)}</td>
                            <td className="py-1.5 text-text-2">{p.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {variantes.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase text-text-3">
                      Cuerpo JSON{variantes.length > 1 ? " (una de estas formas)" : ""}
                    </p>
                    {variantes.map((s, i) => (
                      <div key={i} className="rounded border p-2">
                        <Campos schema={s} />
                      </div>
                    ))}
                  </div>
                )}
                {op.responses && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase text-text-3">Respuestas</p>
                    <ul className="space-y-0.5 text-[13px] text-text-2">
                      {Object.entries(op.responses).map(([codigo, r]) => (
                        <li key={codigo}>
                          <span className="mr-2 font-mono font-semibold text-foreground">{codigo}</span>
                          {r.$ref ? "Error: { error: { code, message } }" : enLinea(r.description ?? "")}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase text-text-3">Ejemplo</p>
                  <pre className="overflow-x-auto rounded bg-subtle p-3 font-mono text-[12px] leading-relaxed">
                    {curl(base, v, path, op)}
                  </pre>
                </div>
              </CardContent>
            </Card>
          );
        });
      })}
      <p className="text-xs text-text-3">{spec.info.title}</p>
    </div>
  );
}
