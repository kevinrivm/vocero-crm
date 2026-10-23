package org.vocero.android;

import java.io.*;
import java.util.Arrays;

/** Sin Android ni red: fronteras de cookies, navegación y archivos. */
public class PoliticaTest {
    private static int casos;
    private static void comprobar(boolean condicion) { casos++; if (!condicion) throw new AssertionError("Caso " + casos); }
    public static void main(String[] args) throws Exception {
        String base = "https://crm.example";
        comprobar(Politica.mismoOrigen(base, base + "/inbox?q=1"));
        comprobar(Politica.mismoOrigen(base, "https://CRM.EXAMPLE:443/api/media/a"));
        for (String u : new String[]{"http://crm.example", "https://crm.example:444", "https://crm.example.evil.test", "https://crm.example@evil.test", "https://user@crm.example", "https://crm.example\\@evil.test", "file:///data/private", "content://private/a", "javascript:alert(1)", "//crm.example", "intent://app"}) comprobar(!Politica.mismoOrigen(base, u));
        comprobar(Politica.medio(base, base + "/api/media/id?download=1"));
        comprobar(!Politica.medio(base, base + "/api/media/id/extra"));
        comprobar(!Politica.medio(base, "https://other.example/api/media/id"));
        for (String u : new String[]{"https://docs.example", "mailto:prueba@example.test", "tel:0000"}) comprobar(Politica.externoPermitido(u));
        for (String u : new String[]{"intent://app", "javascript:alert(1)", "file:///tmp", "content://provider", "http://other.example", "https://user:pass@docs.example"}) comprobar(!Politica.externoPermitido(u));
        for (String tipo : new String[]{"image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"}) comprobar(Politica.compartible(tipo));
        comprobar(!Politica.compartible("text/html")); comprobar(!Politica.compartible(null));
        comprobar(Politica.nombreSeguro("../../archivo\n.pdf").equals("_.._archivo_.pdf"));
        comprobar(Politica.nombreSeguro(null).equals("archivo"));
        comprobar(Politica.nombreCompartido("documento", "application/pdf").equals("documento.pdf"));
        comprobar(Politica.nombreCompartido("FOTO.JPG", "image/jpeg").equals("FOTO.JPG"));
        comprobar(Politica.nombreCompartido("a".repeat(130), "application/pdf").endsWith(".pdf") && Politica.nombreCompartido("a".repeat(130), "application/pdf").length() == 100);
        byte[] datos = "contenido".getBytes(); ByteArrayOutputStream salida = new ByteArrayOutputStream();
        comprobar(Politica.copiar(new ByteArrayInputStream(datos), salida) == datos.length);
        comprobar(Arrays.equals(datos, salida.toByteArray()));
        InputStream grande = new InputStream() {
            long restante = Politica.LIMITE + 1;
            public int read() { return restante-- > 0 ? 0 : -1; }
            public int read(byte[] b, int off, int len) { if (restante <= 0) return -1; int n = (int)Math.min(restante, len); restante -= n; return n; }
        };
        boolean bloqueado = false;
        try { Politica.copiar(grande, OutputStream.nullOutputStream()); } catch (IOException e) { bloqueado = true; }
        comprobar(bloqueado);
        System.out.println(casos + " comprobaciones Java aprobadas");
    }
}
