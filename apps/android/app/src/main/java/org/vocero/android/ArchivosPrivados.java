package org.vocero.android;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import android.webkit.MimeTypeMap;
import java.io.File;
import java.io.FileNotFoundException;
import java.util.UUID;
import java.util.Locale;

/** Solo archivos temporales creados por esta app; nunca rutas arbitrarias. */
public class ArchivosPrivados extends ContentProvider {
    static File carpeta(Context c) { File d = new File(c.getCacheDir(), "adjuntos"); d.mkdirs(); return d; }
    static File nuevo(Context c, String nombre) { return new File(carpeta(c), UUID.randomUUID() + "-" + Politica.nombreSeguro(nombre)); }
    static Uri uri(Context c, File f) { return new Uri.Builder().scheme("content").authority(c.getPackageName() + ".archivos").appendPath(f.getName()).build(); }
    private File archivo(Uri u) throws FileNotFoundException {
        String n = u.getLastPathSegment();
        if (u.getPathSegments().size() != 1 || n == null || !n.matches("[a-f0-9-]{36}-.+") || n.contains("/") || n.contains("\\")) throw new FileNotFoundException();
        return new File(carpeta(getContext()), n);
    }
    @Override public boolean onCreate() { return true; }
    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        int flags = "r".equals(mode) ? ParcelFileDescriptor.MODE_READ_ONLY : ParcelFileDescriptor.MODE_WRITE_ONLY | ParcelFileDescriptor.MODE_CREATE | ParcelFileDescriptor.MODE_TRUNCATE;
        return ParcelFileDescriptor.open(archivo(uri), flags);
    }
    @Override public String getType(Uri uri) {
        String n = uri.getLastPathSegment();
        String t = n == null ? null : MimeTypeMap.getSingleton().getMimeTypeFromExtension(n.substring(n.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT));
        return t == null ? "application/octet-stream" : t;
    }
    @Override public Cursor query(Uri uri, String[] projection, String selection, String[] args, String order) {
        try {
            File f = archivo(uri);
            MatrixCursor c = new MatrixCursor(new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE});
            c.addRow(new Object[]{f.getName().substring(37), f.length()}); return c;
        } catch (FileNotFoundException e) { return null; }
    }
    @Override public Uri insert(Uri u, ContentValues v) { throw new UnsupportedOperationException(); }
    @Override public int delete(Uri u, String s, String[] a) { throw new UnsupportedOperationException(); }
    @Override public int update(Uri u, ContentValues v, String s, String[] a) { throw new UnsupportedOperationException(); }
}
