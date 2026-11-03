import { apiError, withAuth } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import { saveMediaFile } from "@/server/whatsapp/media";
import { updateTenantAppearance } from "@/server/branding";

export const dynamic = "force-dynamic";

const MAX_LOGO_BYTES = 5 * 1024 * 1024; // 5 MB

function sniffImageMime(buf: Uint8Array): string | null {
  if (buf.byteLength < 4) return null;
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return "image/png";
  }
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  // GIF: 47 49 46 38
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {
    return "image/gif";
  }
  // WebP: RIFF ... WEBP
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf.byteLength >= 12 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return "image/webp";
  }
  // SVG: <?xml or <svg
  try {
    const head = new TextDecoder().decode(buf.slice(0, 200)).toLowerCase();
    if (head.includes("<svg") || (head.includes("<?xml") && head.includes("<svg"))) {
      return "image/svg+xml";
    }
  } catch {
    // Si falla decodificar, no es SVG
  }
  return null;
}

export const POST = withAuth(async (session, req: Request) => {
  if (!canConfigure(session.role, session.userRole)) {
    return apiError(403, "forbidden", "Solo administradores o propietarios pueden cambiar la marca");
  }

  const contentType = req.headers.get("content-type") || "";
  let fileBuffer: Uint8Array;

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return apiError(422, "empty", "No se encontró ningún archivo en la petición");
    }
    fileBuffer = new Uint8Array(await file.arrayBuffer());
  } else {
    fileBuffer = new Uint8Array(await req.arrayBuffer());
  }

  if (fileBuffer.byteLength === 0) {
    return apiError(422, "empty", "El archivo está vacío");
  }

  if (fileBuffer.byteLength > MAX_LOGO_BYTES) {
    return apiError(413, "too_large", "El logo no puede exceder 5 MB");
  }

  const mime = sniffImageMime(fileBuffer);
  if (!mime) {
    return apiError(
      422,
      "unsupported",
      "Formato no admitido. Usa PNG, JPEG, SVG, WebP o GIF."
    );
  }

  await saveMediaFile(session.organizationId, "tenant-logo", fileBuffer, mime);

  const logoUrl = `/api/tenant/logo/${session.organizationId}?v=${Date.now()}`;
  await updateTenantAppearance(session.organizationId, { logoUrl });

  return Response.json({ ok: true, logoUrl });
});

