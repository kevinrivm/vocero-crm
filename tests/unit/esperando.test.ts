import { describe, expect, it } from "vitest";
import {
  avisoEsperandoDeCookie,
  claveDeEspera,
  cookieDeAvisoEsperando,
  esperasDe,
  estaEsperando,
  minutosDeEspera,
  MODOS_ESPERANDO,
  nivelDeEspera,
  nuevasParaAvisar,
  textoAviso,
  textoCintillo,
  textoMinutos,
} from "@/lib/esperando";
import { urlDeAvisoSegura } from "@/lib/avisos-sistema";
import {
  calcularEspera,
  contestableHasta,
  necesitaPersona,
  primerMensajeSinRespuesta,
  VENTANA_MAXIMA_MS,
  type MensajeParaEspera,
} from "@/server/inbox/esperando";

/** 077 — «Esperando a una persona»: la regla, el semáforo y los textos. */

const T0 = Date.parse("2026-11-23T15:00:00.000Z");
const HORA = 3_600_000;
const min = (n: number) => new Date(T0 + n * 60_000);

const entra = (m: number): MensajeParaEspera => ({ direction: "in", status: "delivered", aiGenerated: false, createdAt: min(m) });
const equipo = (m: number, status = "sent"): MensajeParaEspera => ({ direction: "out", status, aiGenerated: false, createdAt: min(m) });
const ia = (m: number): MensajeParaEspera => ({ direction: "out", status: "sent", aiGenerated: true, createdAt: min(m) });

const base = {
  isTest: false,
  aiEnabled: false,
  handoffAt: min(0) as Date | null,
  lastInboundAt: min(1) as Date | null,
  lastTeamOutAt: null as Date | null,
  channel: "whatsapp" as const,
};
const ahora = (m: number) => ({ ahora: min(m) });

describe("necesitaPersona", () => {
  it("traspaso abierto o IA en pausa; la IA activa, no", () => {
    expect(necesitaPersona({ aiEnabled: true, handoffAt: min(0) })).toBe(true);
    expect(necesitaPersona({ aiEnabled: false, handoffAt: null })).toBe(true);
    expect(necesitaPersona({ aiEnabled: true, handoffAt: null })).toBe(false);
  });
});

describe("primerMensajeSinRespuesta", () => {
  it("el primer mensaje de la ráfaga sin respuesta, no el último", () => {
    expect(primerMensajeSinRespuesta([equipo(0), entra(2), entra(3), entra(9)], null)).toEqual(min(2));
  });
  it("si el equipo contestó al último, nadie espera", () => {
    expect(primerMensajeSinRespuesta([entra(1), equipo(2)], null)).toBeNull();
  });
  it("un saliente fallido no es una respuesta", () => {
    expect(primerMensajeSinRespuesta([entra(1), equipo(2, "failed")], null)).toEqual(min(1));
  });
  it("sin traspaso, lo que contestó la IA sí cuenta", () => {
    expect(primerMensajeSinRespuesta([entra(1), ia(2)], null)).toBeNull();
  });
  it("con traspaso, la despedida de la IA en el turno que escaló no cuenta", () => {
    // El cliente pide una persona (5), la IA se despide (6) y escala (6:30).
    const msgs = [entra(0), ia(1), entra(5), ia(6)];
    expect(primerMensajeSinRespuesta(msgs, new Date(min(6).getTime() + 30_000))).toEqual(min(5));
  });
  it("con traspaso, lo que la IA contestó ANTES de ese turno sí cuenta", () => {
    const msgs = [entra(0), ia(1), entra(5), ia(6), entra(9)];
    // Si la IA no se hubiera tomado en cuenta, la espera empezaría en 0.
    expect(primerMensajeSinRespuesta(msgs, min(7))).toEqual(min(5));
  });
});

describe("calcularEspera", () => {
  it("traspaso + mensaje del cliente: espera desde ese mensaje", () => {
    const e = calcularEspera(base, [entra(1)], ahora(10));
    expect(e?.desde).toBe(min(1).toISOString());
    expect(e?.hasta).toBe(new Date(min(1).getTime() + 24 * HORA).toISOString());
  });
  it("el equipo contestó después del último mensaje del cliente: no espera", () => {
    expect(calcularEspera({ ...base, lastTeamOutAt: min(2) }, [entra(1), equipo(2)], ahora(10))).toBeNull();
  });
  it("el equipo escribió desde el teléfono (eco) después del cliente: no espera", () => {
    expect(calcularEspera({ ...base, lastTeamOutAt: min(3) }, [entra(1)], ahora(10))).toBeNull();
  });
  it("el cliente vuelve a escribir: espera desde ese mensaje nuevo", () => {
    const e = calcularEspera(
      { ...base, lastInboundAt: min(8), lastTeamOutAt: min(2) },
      [entra(1), equipo(2), entra(8)],
      ahora(10)
    );
    expect(e?.desde).toBe(min(8).toISOString());
  });
  it("la IA activa contestando: no espera", () => {
    expect(calcularEspera({ ...base, aiEnabled: true, handoffAt: null }, [entra(1)], ahora(2))).toBeNull();
  });
  it("con la ventana de 24 h cerrada ya no cuenta", () => {
    expect(calcularEspera(base, [entra(1)], ahora(1 + 24 * 60))).toBeNull();
  });
  it("una conversación de prueba no cuenta", () => {
    expect(calcularEspera({ ...base, isTest: true }, [entra(1)], ahora(5))).toBeNull();
  });
});

describe("contestableHasta", () => {
  it("WhatsApp: 24 h; Instagram y Messenger: los 7 días de agente humano; TikTok: 48 h", () => {
    const d = new Date(T0);
    expect(contestableHasta("whatsapp", d).getTime() - T0).toBe(24 * HORA);
    expect(contestableHasta("instagram", d).getTime() - T0).toBe(7 * 24 * HORA);
    expect(contestableHasta("messenger", d).getTime() - T0).toBe(7 * 24 * HORA);
    expect(contestableHasta("tiktok", d).getTime() - T0).toBe(48 * HORA);
  });
  it("la consulta se acota a la ventana más larga (7 días)", () => {
    expect(VENTANA_MAXIMA_MS).toBe(7 * 24 * HORA);
  });
});

describe("lib/esperando", () => {
  const conv = (id: string, desde: number, hasta = 24 * 60) => ({
    id,
    contact: { name: `Cliente ${id}` },
    espera: { desde: min(desde).toISOString(), hasta: min(hasta).toISOString() },
  });

  it("estaEsperando respeta la ventana", () => {
    expect(estaEsperando(conv("a", 0), min(5).getTime())).toBe(true);
    expect(estaEsperando(conv("a", 0, 4), min(5).getTime())).toBe(false);
    expect(estaEsperando({ espera: null }, min(5).getTime())).toBe(false);
  });

  it("semáforo: neutro < 5, ámbar 5–14, rojo ≥ 15", () => {
    expect(nivelDeEspera(4)).toBe("neutro");
    expect(nivelDeEspera(5)).toBe("ambar");
    expect(nivelDeEspera(14)).toBe("ambar");
    expect(nivelDeEspera(15)).toBe("rojo");
  });

  it("minutos y textos", () => {
    expect(minutosDeEspera(min(0).toISOString(), min(7).getTime() + 59_000)).toBe(7);
    expect(minutosDeEspera(min(10).toISOString(), min(7).getTime())).toBe(0);
    expect(textoMinutos(65)).toBe("1 h 05 min");
    expect(textoMinutos(180)).toBe("3 h");
    expect(textoCintillo(1, 3)).toBe("1 cliente espera a una persona · lleva 3 min");
    expect(textoCintillo(3, 42)).toBe("3 clientes esperan a una persona · el que más lleva: 42 min");
  });

  it("esperasDe ordena de la que más lleva a la que menos y deja fuera a las que no esperan", () => {
    const lista = [conv("b", 10), conv("a", 0), { id: "c", contact: { name: "C" }, espera: null }];
    expect(esperasDe(lista, min(20).getTime()).map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("el aviso sale una vez por espera, y otra vez si es una espera nueva", () => {
    const esperas = esperasDe([conv("a", 0), conv("b", 10)], min(20).getTime());
    const nuevas = nuevasParaAvisar(esperas, new Set());
    expect(nuevas.map((e) => e.id)).toEqual(["a"]); // b lleva 10 min
    const vistas = new Set(nuevas.map(claveDeEspera));
    expect(nuevasParaAvisar(esperas, vistas)).toEqual([]);
    const otraVez = esperasDe([conv("a", 2)], min(20).getTime());
    expect(nuevasParaAvisar(otraVez, vistas).map((e) => e.id)).toEqual(["a"]);
    expect(textoAviso(nuevas)).toBe("Cliente a lleva 20 min esperando a una persona");
    expect(textoAviso([...nuevas, ...nuevas])).toBe("2 clientes llevan más de 15 min esperando a una persona");
  });
});

describe("qué ve cada persona de «Esperando» (cookie)", () => {
  it("sin cookie, vacía o manipulada: ve todo y con sonido", () => {
    for (const v of [undefined, null, "", "basura", "a_veces.1", "%E0%A4%A"]) {
      expect(avisoEsperandoDeCookie(v)).toEqual({ modo: "todo", sonido: true });
    }
  });

  it("guardar y leer da lo mismo en todas las combinaciones", () => {
    for (const modo of MODOS_ESPERANDO) {
      for (const sonido of [true, false]) {
        expect(avisoEsperandoDeCookie(cookieDeAvisoEsperando({ modo, sonido }))).toEqual({ modo, sonido });
      }
    }
  });
});

describe("el aviso del sistema puede abrir la pestaña «Esperando»", () => {
  it("acepta la Bandeja, una conversación, con o sin vista, y nada más", () => {
    expect(urlDeAvisoSegura("/inbox")).toBe("/inbox");
    expect(urlDeAvisoSegura("/inbox?vista=esperando")).toBe("/inbox?vista=esperando");
    expect(urlDeAvisoSegura("/inbox?conversation=cv_1&vista=esperando")).toBe("/inbox?conversation=cv_1&vista=esperando");
    expect(urlDeAvisoSegura("/inbox?vista=otra")).toBeNull();
    expect(urlDeAvisoSegura("https://otro.sitio/inbox")).toBeNull();
  });
});
