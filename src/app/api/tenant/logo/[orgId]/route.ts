import { readMediaFile } from "@/server/whatsapp/media";

export const dynamic = "force-dynamic";

function cabeceras(mime: string, cacheable: boolean): HeadersInit {
  return {
    "content-type": mime,
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
    "x-content-type-options": "nosniff",
    "cache-control": cacheable
      ? "public, max-age=31536000, immutable"
      : "public, max-age=60",
  };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const cacheable = new URL(req.url).searchParams.has("v");

  try {
    const buf = await readMediaFile(orgId, "tenant-logo");
    // Sniff de tipo básico
    let mime = "image/png";
    if (buf.length > 4) {
      if (buf[0] === 0xff && buf[1] === 0xd8) mime = "image/jpeg";
      else if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) mime = "image/png";
      else if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) mime = "image/webp";
      else if (new TextDecoder().decode(buf.slice(0, 50)).includes("<svg")) mime = "image/svg+xml";
    }

    return new Response(new Uint8Array(buf), {
      headers: cabeceras(mime, cacheable),
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

