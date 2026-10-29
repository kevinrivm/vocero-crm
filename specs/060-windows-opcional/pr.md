# 060 — Contenedor Windows opcional de la instancia

La PWA sigue siendo la instalación recomendada. Para quien necesita bandeja de
Windows, este contenedor abre la instancia elegida, toma su marca del manifest y
conserva la sesión original cifrada con DPAPI, sin guardar contraseñas.

Reutiliza los avisos SSE de la 056 y los adjuntos del CRM. Añade inicio opcional,
Guardar como, enlaces externos confirmados, recuperación de conexión y un feed
de actualización opcional del operador. Citas avisa solo con Agenda activa y
con su modelo original; no hay tablas, contratos ni servicios nuevos.

Independiente del PR Android #158, desde `main` (2.4.0). Carril ligero y
límites en [spec.md](spec.md); compilación, firma opcional y SmartScreen en
[apps/windows/README.md](../../apps/windows/README.md). El número de versión
queda para el mantenedor.

Typecheck, lint y build aprobados en ambas matrices; 1.357 tests del original
por matriz, 24 pruebas nativas y 27 comprobaciones Electron/HTTP aprobadas.
Validación y límites de la prueba Windows: [verificacion.md](verificacion.md).
El instalador es de prueba, sin firma ni publicación. La aceptación implica
mantener Electron y definir quién firma/distribuye; este PR no crea un feed central.
