package org.vocero.android;

import java.net.URI;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.IOException;
import java.util.Locale;

/** Fronteras puras: no dependen de Android ni de una sesión. */
public final class Politica {
    private Politica() {}
    public static final long LIMITE = 50L * 1024 * 1024;
    public static boolean mismoOrigen(String base, String destino) {
        try {
            URI a = new URI(base), b = new URI(destino);
            return b.getUserInfo() == null && a.getScheme().equalsIgnoreCase(b.getScheme())
                && a.getHost() != null && a.getHost().equalsIgnoreCase(b.getHost())
                && puerto(a) == puerto(b) && !destino.contains("\\");
        } catch (Exception e) { return false; }
    }
    private static int puerto(URI u) { return u.getPort() >= 0 ? u.getPort() : "https".equalsIgnoreCase(u.getScheme()) ? 443 : 80; }
    public static boolean externoPermitido(String destino) {
        try {
            URI u = new URI(destino); String s = u.getScheme();
            if (s == null || u.getUserInfo() != null || destino.contains("\\")) return false;
            return ("https".equalsIgnoreCase(s) && u.getHost() != null)
                || "tel".equalsIgnoreCase(s) || "mailto".equalsIgnoreCase(s);
        } catch (Exception e) { return false; }
    }
    public static boolean medio(String base, String destino) {
        try { return mismoOrigen(base, destino) && new URI(destino).getPath().matches("/api/media/[^/]+"); }
        catch (Exception e) { return false; }
    }
    public static boolean compartible(String tipo) {
        return "image/png".equals(tipo) || "image/jpeg".equals(tipo) || "image/webp".equals(tipo)
            || "image/gif".equals(tipo) || "application/pdf".equals(tipo);
    }
    public static String nombreSeguro(String nombre) {
        if (nombre == null) return "archivo";
        String n = nombre.replaceAll("[\\\\/\\p{Cntrl}]", "_").replaceAll("^\\.+", "").trim();
        return n.isEmpty() ? "archivo" : n.substring(0, Math.min(100, n.length()));
    }
    public static String extension(String tipo) {
        if ("application/pdf".equals(tipo)) return ".pdf";
        if ("image/jpeg".equals(tipo)) return ".jpg";
        if (compartible(tipo)) return "." + tipo.substring(6).toLowerCase(Locale.ROOT);
        return ".bin";
    }
    public static String nombreCompartido(String nombre, String tipo) {
        String n = nombreSeguro(nombre), ext = extension(tipo);
        if (n.toLowerCase(Locale.ROOT).endsWith(ext)) return n;
        return n.substring(0, Math.min(100 - ext.length(), n.length())) + ext;
    }
    public static long copiar(InputStream entrada, OutputStream salida) throws IOException {
        byte[] bloque = new byte[32768]; long total = 0; int n;
        while ((n = entrada.read(bloque)) != -1) {
            total += n;
            if (total > LIMITE) throw new IOException("Archivo mayor de 50 MiB");
            salida.write(bloque, 0, n);
        }
        return total;
    }
}
