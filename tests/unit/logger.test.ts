import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * El logger estructurado: una línea de JSON por evento, nivel filtrable por
 * LOG_LEVEL, y `err` serializado a string (un Error crudo en JSON se vuelve
 * {} — el caso de uso número uno de "log inútil en producción").
 */

const writes: string[] = [];
import { createLogger } from "@/lib/logger";

function lines(): Record<string, unknown>[] {
  return writes.map((w) => JSON.parse(w) as Record<string, unknown>);
}

describe("createLogger", () => {
  afterEach(() => {
    writes.length = 0;
    delete process.env.LOG_LEVEL;
  });

  it("emite una línea JSON con ts/level/scope/msg y campos aplanados", () => {
    const spy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(((chunk: string | Uint8Array) => {
        writes.push(typeof chunk === "string" ? chunk : "");
        return true;
      }) as typeof process.stdout.write);
    const log = createLogger("webhook");
    log.warn("echo sin destinatario", { echoId: "wamid.X" });
    spy.mockRestore();

    const entry = lines()[0]!;
    expect(entry).toMatchObject({
      level: "warn",
      scope: "webhook",
      msg: "echo sin destinatario",
      echoId: "wamid.X",
    });
    expect(typeof entry.ts).toBe("string");
  });

  it("serializa `err` (Error) a string con mensaje — no a {}", () => {
    const spy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(((chunk: string | Uint8Array) => {
        writes.push(typeof chunk === "string" ? chunk : "");
        return true;
      }) as typeof process.stdout.write);
    const log = createLogger("lab");
    log.error("corrida falló", { err: new Error("timeout de 10 minutos") });
    spy.mockRestore();

    const entry = lines()[0]!;
    expect(entry.err).toBeTypeOf("string");
    expect(entry.err as string).toContain("timeout de 10 minutos");
  });

  it("LOG_LEVEL=error silencia info y warn", () => {
    process.env.LOG_LEVEL = "error";
    const spy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(((chunk: string | Uint8Array) => {
        writes.push(typeof chunk === "string" ? chunk : "");
        return true;
      }) as typeof process.stdout.write);
    const log = createLogger("x");
    log.debug("d");
    log.info("i");
    log.warn("w");
    log.error("e");
    spy.mockRestore();

    const levels = lines().map((l) => l.level);
    expect(levels).toEqual(["error"]);
  });
});
