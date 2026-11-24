import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import { isMockEnabled } from "@/lib/env";
import {
  ipPublica,
  urlDeAdjuntoPermitida,
  type OrigenRemoto,
} from "@/server/inbox/remote-media";

/**
 * 074 — Baja un adjunto de Instagram, Messenger o TikTok desde la URL firmada
 * que mandó la plataforma. Sin token: la firma va en la propia URL.
 *
 * La URL llega dentro de un webhook, así que se trata como dato ajeno:
 * - la forma se revisa antes de cada salto (`urlDeAdjuntoPermitida`);
 * - la IP se revisa AL CONECTAR (`lookup` propio), no antes: un nombre que
 *   resuelve a la red interna, o que cambia de respuesta entre la revisión y
 *   la conexión, no pasa;
 * - tiempo total y tamaño acotados, el cuerpo se corta al pasar el tope.
 */

const MAX_REDIRECCIONES = 3;
const TIEMPO_MS = 30_000;

export class DescargaRemotaError extends Error {
  /** true si la plataforma ya no lo tiene o no se debe reintentar. */
  gone: boolean;
  constructor(message: string, gone = false) {
    super(message);
    this.name = "DescargaRemotaError";
    this.gone = gone;
  }
}

/** El origen del simulador; solo existe con los mocks habilitados. */
function origenDelMock(): string | null {
  if (!isMockEnabled()) return null;
  const base = process.env.APP_BASE_URL;
  if (!base) return null;
  try {
    return new URL(base).origin;
  } catch {
    return null;
  }
}

/** Resuelve como siempre, pero se niega a conectar a una IP que no es pública. */
export const lookupPublico: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (err, direcciones) => {
    if (err) return callback(err, "", 0);
    const lista = direcciones as unknown as LookupAddress[];
    if (!lista.length || !lista.every((d) => ipPublica(d.address))) {
      const e = new Error(`${hostname} no resuelve a una IP pública`) as NodeJS.ErrnoException;
      e.code = "EPRIVADA";
      return callback(e, "", 0);
    }
    if (options.all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, lista);
    const primera = lista[0]!;
    callback(null, primera.address, primera.family);
  });
};

type Respuesta = {
  status: number;
  location: string | null;
  contentType: string | null;
  body: Buffer | null;
};

function pedir(url: URL, maxBytes: number, esMock: boolean, fin: number): Promise<Respuesta> {
  return new Promise((resolve, reject) => {
    const restante = fin - Date.now();
    if (restante <= 0) return reject(new DescargaRemotaError("Se acabó el tiempo de descarga"));
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.get(
      url,
      {
        // El simulador vive en esta misma máquina; lo demás, solo a internet.
        ...(esMock ? {} : { lookup: lookupPublico }),
        headers: { accept: "*/*", "user-agent": "Vocero-CRM" },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({
            status,
            location: res.headers.location ?? null,
            contentType: null,
            body: null,
          });
        }
        if (status < 200 || status >= 300) {
          res.resume();
          return resolve({ status, location: null, contentType: null, body: null });
        }
        const declarado = Number(res.headers["content-length"] ?? 0);
        if (declarado > maxBytes) {
          res.destroy();
          return reject(new DescargaRemotaError("El adjunto excede el límite de tamaño", true));
        }
        const trozos: Buffer[] = [];
        let total = 0;
        res.on("data", (c: Buffer) => {
          total += c.byteLength;
          if (total > maxBytes) {
            res.destroy();
            reject(new DescargaRemotaError("El adjunto excede el límite de tamaño", true));
            return;
          }
          trozos.push(c);
        });
        res.on("end", () =>
          resolve({
            status,
            location: null,
            contentType: res.headers["content-type"] ?? null,
            body: Buffer.concat(trozos),
          })
        );
        res.on("error", () => reject(new DescargaRemotaError("La descarga se cortó a medias")));
      }
    );
    req.setTimeout(restante, () => {
      req.destroy(new DescargaRemotaError("Se acabó el tiempo de descarga"));
    });
    req.on("error", (err) => {
      if (err instanceof DescargaRemotaError) return reject(err);
      const privada = (err as NodeJS.ErrnoException).code === "EPRIVADA";
      reject(
        new DescargaRemotaError(
          privada ? "La URL del adjunto apunta a una red privada" : "No se pudo descargar el adjunto",
          privada
        )
      );
    });
  });
}

export async function descargarAdjuntoRemoto(
  url: string,
  origen: OrigenRemoto,
  maxBytes: number
): Promise<{ data: Buffer; mimeType: string | null; fileSize: number }> {
  const origenMock = origenDelMock();
  const fin = Date.now() + TIEMPO_MS;
  let actual = url;
  for (let salto = 0; salto <= MAX_REDIRECCIONES; salto++) {
    if (!urlDeAdjuntoPermitida(actual, origen, origenMock)) {
      throw new DescargaRemotaError("La URL del adjunto no es de un origen permitido", true);
    }
    const u = new URL(actual);
    const res = await pedir(u, maxBytes, origenMock !== null && u.origin === origenMock, fin);
    if (res.status >= 300 && res.status < 400) {
      if (!res.location) throw new DescargaRemotaError("Redirección sin destino", true);
      actual = new URL(res.location, actual).toString();
      continue;
    }
    if (res.status < 200 || res.status >= 300 || !res.body) {
      // Los CDN responden 403 cuando la firma de la URL ya caducó.
      throw new DescargaRemotaError(
        `La descarga devolvió ${res.status}`,
        [400, 401, 403, 404, 410].includes(res.status)
      );
    }
    if (res.body.byteLength === 0) throw new DescargaRemotaError("El adjunto llegó vacío", true);
    const mimeType = res.contentType?.split(";")[0]?.trim().toLowerCase() || null;
    return { data: res.body, mimeType, fileSize: res.body.byteLength };
  }
  throw new DescargaRemotaError("Demasiadas redirecciones", true);
}
