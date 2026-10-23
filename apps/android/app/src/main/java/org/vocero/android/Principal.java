package org.vocero.android;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Bundle;
import android.os.Build;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.*;
import android.widget.*;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Arrays;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/** Capa nativa: el CRM, sus permisos y sus cookies siguen siendo del servidor. */
public class Principal extends Activity {
    private WebView web;
    private LinearLayout raiz, aviso;
    private TextView estado;
    private String ultima = BuildConfig.SERVIDOR + "/inbox";
    private ValueCallback<Uri[]> selector;
    private Uri foto, compartido;
    private PermissionRequest microfono;
    private boolean sesionVista;
    private int versionArchivos;
    private final ExecutorService archivos = Executors.newSingleThreadExecutor();
    private final AtomicBoolean descargando = new AtomicBoolean(false);
    private static final int ARCHIVO = 10, FOTO = 11, AUDIO = 12;

    @Override public void onCreate(Bundle b) {
        super.onCreate(b);
        if (Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::volver);
        limpiarTemporales();
        raiz = new LinearLayout(this); raiz.setOrientation(LinearLayout.VERTICAL);
        raiz.setOnApplyWindowInsetsListener((v, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets i = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
                v.setPadding(i.left, i.top, i.right, i.bottom);
            } else v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        estado = new TextView(this); estado.setText("Cargando…"); estado.setTextSize(16); estado.setPadding(16, 8, 16, 8);
        estado.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        raiz.addView(estado);
        aviso = new LinearLayout(this); aviso.setOrientation(LinearLayout.VERTICAL); aviso.setGravity(Gravity.CENTER); aviso.setPadding(24, 24, 24, 24);
        TextView titulo = new TextView(this); titulo.setText("Sin conexión"); titulo.setTextSize(24); titulo.setGravity(Gravity.CENTER);
        TextView ayuda = new TextView(this); ayuda.setText("Comprueba tu conexión y vuelve a intentar. No se muestran conversaciones guardadas."); ayuda.setTextSize(16); ayuda.setGravity(Gravity.CENTER);
        Button reintentar = new Button(this); reintentar.setText("Reintentar"); reintentar.setMinHeight((int) (48 * getResources().getDisplayMetrics().density)); reintentar.setOnClickListener(v -> abrir(ultima));
        aviso.addView(titulo); aviso.addView(ayuda); aviso.addView(reintentar); aviso.setVisibility(View.GONE);
        raiz.addView(aviso, new LinearLayout.LayoutParams(-1, 0, 1));
        web = new WebView(this);
        raiz.addView(web, new LinearLayout.LayoutParams(-1, 0, 1)); setContentView(raiz);
        boolean oscuro = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        if (Build.VERSION.SDK_INT >= 30) getWindow().getInsetsController().setSystemBarsAppearance(oscuro ? 0 : android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS, android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
        else getWindow().getDecorView().setSystemUiVisibility(oscuro ? 0 : View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        raiz.setBackgroundColor(oscuro ? Color.BLACK : Color.WHITE);
        reintentar.setBackgroundTintList(android.content.res.ColorStateList.valueOf(getColor(R.color.color_marca)));
        reintentar.setTextColor(Color.WHITE);
        for (TextView t : new TextView[]{estado, titulo, ayuda}) t.setTextColor(oscuro ? Color.WHITE : Color.BLACK);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        s.setAllowFileAccess(false); s.setAllowContentAccess(true); s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setGeolocationEnabled(false); s.setSaveFormData(false); s.setSupportMultipleWindows(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                String u = r.getUrl().toString();
                if (!r.isForMainFrame()) return !Politica.mismoOrigen(BuildConfig.SERVIDOR, u);
                if (Politica.medio(BuildConfig.SERVIDOR, u)) { descargar(u, null); return true; }
                if (Politica.mismoOrigen(BuildConfig.SERVIDOR, u)) return false;
                externo(u); return true;
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                String esquema = r.getUrl().getScheme();
                // Los content:// elegidos solo viajan por el selector, nunca por una navegación.
                if ("file".equals(esquema) || "content".equals(esquema)) return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden", null, new ByteArrayInputStream(new byte[0]));
                return null;
            }
            @Override public void onPageStarted(WebView v, String url, android.graphics.Bitmap icon) {
                if (Politica.mismoOrigen(BuildConfig.SERVIDOR, url)) ultima = url;
                estado.setText("Cargando…"); estado.setVisibility(View.VISIBLE);
            }
            @Override public void onPageFinished(WebView v, String url) {
                estado.setVisibility(View.GONE); CookieManager.getInstance().flush();
                if (Politica.mismoOrigen(BuildConfig.SERVIDOR, url) && "/login".equals(Uri.parse(url).getPath())) {
                    web.clearHistory(); web.clearCache(true); WebStorage.getInstance().deleteAllData();
                    if (sesionVista) { versionArchivos++; compartido = null; limpiarTemporales(); sesionVista = false; }
                } else if (Politica.mismoOrigen(BuildConfig.SERVIDOR, url) && "/inbox".equals(Uri.parse(url).getPath())) sesionVista = true;
            }
            @Override public void doUpdateVisitedHistory(WebView v, String url, boolean recarga) {
                // Next navega con history.pushState: salir no siempre carga otro documento.
                if (Politica.mismoOrigen(BuildConfig.SERVIDOR, url) && "/inbox".equals(Uri.parse(url).getPath())) sesionVista = true;
                if (sesionVista && Politica.mismoOrigen(BuildConfig.SERVIDOR, url) && "/login".equals(Uri.parse(url).getPath())) {
                    versionArchivos++; compartido = null; limpiarTemporales(); sesionVista = false;
                    web.clearHistory(); web.clearCache(true); WebStorage.getInstance().deleteAllData();
                }
            }
            @Override public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) { if (r.isForMainFrame()) sinConexion(); }
            @Override public void onReceivedSslError(WebView v, SslErrorHandler h, SslError e) { h.cancel(); sinConexion(); }
            @Override public void onReceivedHttpError(WebView v, WebResourceRequest r, WebResourceResponse e) { if (r.isForMainFrame() && e.getStatusCode() >= 500) sinConexion(); }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (!Politica.mismoOrigen(BuildConfig.SERVIDOR, v.getUrl())) { cb.onReceiveValue(null); return true; }
                terminarSelector(null); selector = cb;
                String[] opciones = compartido == null ? new String[]{"Archivos", "Cámara"} : new String[]{"Archivos", "Cámara", "Archivo compartido"};
                new AlertDialog.Builder(Principal.this).setTitle("Adjuntar archivo").setItems(opciones, (d, n) -> {
                    if (n == 0) elegirArchivo(p);
                    else if (n == 1) camara();
                    else { Uri u = compartido; compartido = null; terminarSelector(new Uri[]{u}); }
                }).setOnCancelListener(d -> terminarSelector(null)).show();
                return true;
            }
            @Override public void onPermissionRequest(PermissionRequest p) {
                if (!Politica.mismoOrigen(BuildConfig.SERVIDOR, p.getOrigin().toString()) || !Arrays.asList(p.getResources()).contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) { p.deny(); return; }
                if (microfono != null) microfono.deny(); microfono = p;
                new AlertDialog.Builder(Principal.this).setMessage("El micrófono permite grabar la nota de voz que tú envías en la conversación.")
                    .setPositiveButton("Continuar", (d, n) -> {
                        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) resolverAudio(true);
                        else requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, AUDIO);
                    }).setNegativeButton("Cancelar", (d, n) -> resolverAudio(false)).setOnCancelListener(d -> resolverAudio(false)).show();
            }
            @Override public void onPermissionRequestCanceled(PermissionRequest p) { if (microfono == p) microfono = null; }
        });
        web.setDownloadListener((url, ua, disposition, mime, length) -> descargar(url, disposition));
        recibirCompartido(getIntent()); abrir(ultima);
    }

    private void abrir(String url) { aviso.setVisibility(View.GONE); web.setVisibility(View.VISIBLE); estado.setVisibility(View.VISIBLE); web.loadUrl(url); }
    private void sinConexion() { web.stopLoading(); web.setVisibility(View.GONE); estado.setVisibility(View.GONE); aviso.setVisibility(View.VISIBLE); aviso.announceForAccessibility("Sin conexión. Reintentar."); }
    private void mensaje(String texto) { runOnUiThread(() -> Toast.makeText(this, texto, Toast.LENGTH_LONG).show()); }
    private void externo(String url) {
        if (!Politica.externoPermitido(url)) { mensaje("Enlace no permitido"); return; }
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE)); }
        catch (Exception e) { mensaje("No hay una aplicación para abrir el enlace"); }
    }
    private void terminarSelector(Uri[] uris) { if (selector != null) { selector.onReceiveValue(uris); selector = null; } }
    private void elegirArchivo(WebChromeClient.FileChooserParams p) {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
        String[] tipos = Arrays.stream(p.getAcceptTypes()).filter(t -> t.contains("/") && !t.contains(",")).toArray(String[]::new);
        if (tipos.length > 0) i.putExtra(Intent.EXTRA_MIME_TYPES, tipos);
        try { startActivityForResult(i, ARCHIVO); } catch (Exception e) { terminarSelector(null); mensaje("No hay selector de archivos"); }
    }
    private void camara() {
        new AlertDialog.Builder(this).setMessage("Se abrirá la cámara para tomar una foto. Antes de enviarla verás la vista previa en el CRM.")
            .setPositiveButton("Abrir cámara", (d, n) -> {
                File f = ArchivosPrivados.nuevo(this, "foto.jpg"); foto = ArchivosPrivados.uri(this, f);
                Intent i = new Intent(MediaStore.ACTION_IMAGE_CAPTURE).putExtra(MediaStore.EXTRA_OUTPUT, foto);
                i.setClipData(ClipData.newRawUri("foto", foto)); i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                try { startActivityForResult(i, FOTO); } catch (Exception e) { terminarSelector(null); mensaje("No hay cámara disponible"); }
            }).setNegativeButton("Cancelar", (d, n) -> terminarSelector(null)).setOnCancelListener(d -> terminarSelector(null)).show();
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == FOTO) { terminarSelector(result == RESULT_OK ? new Uri[]{foto} : null); foto = null; }
        if (request == ARCHIVO) {
            Uri u = result == RESULT_OK && data != null ? data.getData() : null;
            if (u != null && (!"content".equals(u.getScheme()) || (getPackageName() + ".archivos").equals(u.getAuthority()))) u = null;
            terminarSelector(u == null ? null : new Uri[]{u});
        }
    }
    private void resolverAudio(boolean permitir) {
        if (microfono == null) return;
        if (permitir && Politica.mismoOrigen(BuildConfig.SERVIDOR, web.getUrl())) microfono.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
        else microfono.deny(); microfono = null;
    }
    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(request, permissions, results);
        if (request == AUDIO) resolverAudio(results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED);
    }
    @Override protected void onNewIntent(Intent i) { super.onNewIntent(i); setIntent(i); recibirCompartido(i); abrir(BuildConfig.SERVIDOR + "/inbox"); }
    private void recibirCompartido(Intent i) {
        if (!Intent.ACTION_SEND.equals(i.getAction())) return;
        Uri uri = i.getParcelableExtra(Intent.EXTRA_STREAM);
        // Consumir una sola vez: un cambio de configuración no vuelve a compartir.
        setIntent(new Intent(this, Principal.class));
        if (uri == null || !"content".equals(uri.getScheme()) || (getPackageName() + ".archivos").equals(uri.getAuthority())) { mensaje("Archivo compartido no permitido"); return; }
        int version = versionArchivos;
        archivos.execute(() -> {
            File destino = null;
            try {
                String tipo = getContentResolver().getType(uri);
                if (!Politica.compartible(tipo)) throw new IOException();
                String nombre = "compartido" + Politica.extension(tipo);
                try (android.database.Cursor c = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
                    if (c != null && c.moveToFirst()) nombre = Politica.nombreSeguro(c.getString(0));
                }
                destino = ArchivosPrivados.nuevo(this, Politica.nombreCompartido(nombre, tipo));
                try (InputStream in = getContentResolver().openInputStream(uri); OutputStream out = new FileOutputStream(destino)) { Politica.copiar(in, out); }
                Uri propia = ArchivosPrivados.uri(this, destino);
                File temporal = destino;
                runOnUiThread(() -> {
                    if (isFinishing() || isDestroyed() || version != versionArchivos) { temporal.delete(); return; }
                    compartido = propia;
                    new AlertDialog.Builder(this).setMessage("Elige la conversación y pulsa el clip → Archivo compartido. Revisa la vista previa antes de enviar.").setPositiveButton("Entendido", null).show();
                });
            } catch (Exception e) { if (destino != null) destino.delete(); mensaje("No se pudo recibir la imagen o PDF (máximo 50 MiB)"); }
        });
    }
    private void descargar(String url, String disposition) {
        if (!Politica.mismoOrigen(BuildConfig.SERVIDOR, url)) { mensaje("Descarga fuera de la instancia bloqueada"); return; }
        if (!descargando.compareAndSet(false, true)) { mensaje("Hay una descarga en curso"); return; }
        String cookie = CookieManager.getInstance().getCookie(BuildConfig.SERVIDOR);
        mensaje("Descargando…");
        archivos.execute(() -> {
            Uri guardado = null; HttpURLConnection c = null;
            try {
                String destino = url;
                for (int salto = 0; salto < 5; salto++) {
                    if (!Politica.mismoOrigen(BuildConfig.SERVIDOR, destino)) throw new IOException();
                    c = (HttpURLConnection) new URL(destino).openConnection(); c.setInstanceFollowRedirects(false); c.setConnectTimeout(15000); c.setReadTimeout(20000);
                    if (cookie != null) c.setRequestProperty("Cookie", cookie);
                    int codigo = c.getResponseCode();
                    if (codigo >= 300 && codigo < 400) { String l = c.getHeaderField("Location"); if (l == null) throw new IOException(); destino = new URL(new URL(destino), l).toString(); c.disconnect(); c = null; continue; }
                    if (codigo != 200 || c.getContentLengthLong() > Politica.LIMITE) throw new IOException();
                    break;
                }
                if (c == null) throw new IOException();
                String tipo = c.getContentType(); if (tipo == null) tipo = "application/octet-stream"; tipo = tipo.split(";")[0];
                if (tipo.equals("text/html")) throw new IOException();
                String cabecera = c.getHeaderField("Content-Disposition");
                String nombre = Politica.nombreSeguro(URLUtil.guessFileName(destino, cabecera == null ? disposition : cabecera, tipo));
                ContentValues valores = new ContentValues(); valores.put(MediaStore.Downloads.DISPLAY_NAME, nombre); valores.put(MediaStore.Downloads.MIME_TYPE, tipo); valores.put(MediaStore.Downloads.IS_PENDING, 1);
                guardado = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, valores);
                if (guardado == null) throw new IOException();
                try (InputStream in = c.getInputStream(); OutputStream out = getContentResolver().openOutputStream(guardado)) { Politica.copiar(in, out); }
                valores.clear(); valores.put(MediaStore.Downloads.IS_PENDING, 0); getContentResolver().update(guardado, valores, null, null);
                Uri finalUri = guardado; String finalTipo = tipo;
                runOnUiThread(() -> { if (isFinishing() || isDestroyed()) return; new AlertDialog.Builder(this).setMessage("Archivo guardado en Descargas")
                    .setPositiveButton("Abrir", (d, n) -> {
                        try { startActivity(new Intent(Intent.ACTION_VIEW).setDataAndType(finalUri, finalTipo).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)); }
                        catch (Exception e) { mensaje("No hay lector compatible. El archivo está en Descargas."); }
                    }).setNegativeButton("Cerrar", null).show(); });
            } catch (Exception e) { if (guardado != null) getContentResolver().delete(guardado, null, null); mensaje("No se pudo descargar: revisa la sesión, la conexión y el límite de 50 MiB"); }
            finally { if (c != null) c.disconnect(); descargando.set(false); }
        });
    }
    private void limpiarTemporales() { File[] fs = ArchivosPrivados.carpeta(this).listFiles(); if (fs != null) for (File f : fs) if (f.isFile()) f.delete(); }
    private void volver() { if (web.canGoBack() && aviso.getVisibility() != View.VISIBLE) web.goBack(); else finish(); }
    // API 33+ usa el dispatcher nativo registrado arriba; 29–32 usa este callback.
    @android.annotation.SuppressLint("GestureBackNavigation")
    @Override public void onBackPressed() { volver(); }
    @Override protected void onStop() { CookieManager.getInstance().flush(); super.onStop(); }
    @Override protected void onDestroy() { terminarSelector(null); resolverAudio(false); web.destroy(); archivos.shutdown(); super.onDestroy(); }
}
