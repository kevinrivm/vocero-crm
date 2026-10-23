# 053 — Android opcional (guion reproducible)

Usar exclusivamente una instancia local aislada, con base vacía y `WA_MOCK_ENABLED=true`,
`META_GRAPH_BASE_URL=http://localhost:3003/api/dev/wa-mock/graph`,
`APP_BASE_URL=http://localhost:3003`. No conectar WhatsApp real. Preparar la cuenta,
marca y conversación ficticias con `node apps/android/preparar-prueba.mjs`.
Compilar/instalar como indica `apps/android/README.md`. Silenciar el emulador.

1. Abrir el APK: entrar con la cuenta ficticia del preparador. El login original
   puede llevar a Guía de inicio. Abrir menú → Bandeja → Cliente ficticio.
2. Clip → Cámara → confirmar → capturar → aceptar. Debe aparecer `foto.jpg` en la
   previa original; pulsar Enviar. Confirmar mensaje en Bandeja y en wa-mock/outbox.
3. Clip → Archivos: elegir un PDF ficticio desde Descargas. Revisar previa y enviar.
   Pulsar su enlace: guardar en Descargas → Abrir. El lector debe mostrar el PDF.
   Cancelar selector y cámara debe volver al chat sin adjuntar ni enviar nada.
4. Desde el lector: Compartir → nombre de tu marca. Se abre Bandeja e instrucción,
   nunca un envío. Elegir chat → clip → Archivo compartido: ver previa; cancelar.
   Repetir con imagen y con proceso del app cerrado. Con app ya abierto debe
   reutilizarse su actividad, sin duplicar ventanas ni perder la sesión.
5. Pulsar el enlace HTTPS del mensaje ficticio: se abre el navegador externo.
   Volver al app conserva la conversación. Pedir nota de voz: denegar micrófono
   y verificar que no cuelga; el permiso nunca se pide al abrir la aplicación.
6. Desconectar Wi-Fi/datos y quitar el reverse ADB, cerrar/reabrir el APK:
   debe verse «Sin conexión» (fallback del PWA o nativo), sin conversaciones viejas.
   Restablecer red/reverse y pulsar Reintentar: vuelve Bandeja con sesión válida.
7. Probar claro/oscuro, letra grande, teclado y orientación horizontal; controles
   alcanzables y sin contenido debajo de las barras del sistema. Atrás vuelve
   a la pantalla anterior o sale en la raíz; no vuelve a una sesión cerrada.
8. Menú → Cerrar sesión; cerrar/reabrir: login. Revocar la sesión en el servidor
   también exige volver a entrar. No se crea una sesión de 90 días.
9. Preparar/compilar otra marca ficticia, conservando paquete/clave: nombre e icono
   del APK cambian. Sin firma propia, release debe fallar; también con origen HTTP.

Ejemplos ADB (elige tu serial; no usar otro dispositivo por defecto):

```sh
adb -s emulator-5556 reverse tcp:3003 tcp:3003
adb -s emulator-5556 shell am start -n org.vocero.pruebas/org.vocero.android.Principal
adb -s emulator-5556 shell svc wifi disable
adb -s emulator-5556 shell svc data disable
adb -s emulator-5556 reverse --remove tcp:3003
adb -s emulator-5556 shell am force-stop org.vocero.pruebas
# Reabrir, observar offline; después:
adb -s emulator-5556 shell svc wifi enable
adb -s emulator-5556 shell svc data enable
adb -s emulator-5556 reverse tcp:3003 tcp:3003
```

La inspección CDP de WebView solo está disponible en debug. Con Playwright,
`connectOverCDP(..., { noDefaults: true })` evita configurar descargas/contextos
que WebView no implementa. Cámara, selector y compartir se ejercen por ADB sobre
la UI del sistema; no se reemplazan por subir un archivo desde el PC vía CDP.
Para navegar tras compartir, conectar la página activa, no una página anterior.

Pruebas negativas puras: `node apps/android/probar.mjs` cubre origen/puerto,
credenciales en URL, esquemas bloqueados, medios, MIME, nombres y límite de tamaño.
Vitest cubre marca, PNG, fallo de preparación y redirección. No se necesitan
credenciales reales, Firebase ni una cuenta de Google.
