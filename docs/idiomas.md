# Idiomas de la interfaz

Vocero 2.1 permite español (`es`) y portugués de Brasil (`pt-BR`).
En **Ajustes → Marca → Idioma predeterminado**, el propietario elige el idioma
del negocio. El selector del lateral y del acceso permite elegir un idioma
para este navegador o volver al predeterminado del negocio.

La prioridad es cookie válida → idioma de la empresa → español. La cookie
`vocero-locale` dura un año, tiene alcance `/`, SameSite=Lax y Secure bajo
HTTPS. Al elegir «Usar idioma de la empresa» se elimina. No es una preferencia
del usuario en la base de datos: otro navegador puede elegir otro idioma.

El HTML inicial y los componentes de React usan la misma resolución por petición.
Cambiar el selector refresca los componentes de servidor conservando la ruta,
la consulta y la sesión. Las instalaciones anteriores siguen en español hasta
que el propietario elija otro idioma. La pantalla de acceso usa la única
organización de la instancia cuando todavía no existe sesión.

## Qué cambia y qué no

Se traducen los controles, navegación, ayuda y mensajes del operador.
Las fechas y los importes usan el formato regional de la interfaz. El código
de moneda y el huso del negocio siguen siendo independientes.

Los mensajes de clientes, nombres y etapas guardadas, instrucciones del agente,
conocimiento, plantillas y resultados históricos del Laboratorio conservan su
contenido. Los ejemplos de mensajes de WhatsApp mantienen el idioma de la
plantilla elegida; la interfaz no modifica esos mensajes ni su código de idioma.
`pt_BR` de WhatsApp y `pt-BR` de la interfaz no son intercambiables.
El idioma de atención del cerebro externo y los personajes simulados no se
configuran con este selector.

## Añadir un idioma

1. Añadir su código y nombre nativo en `src/lib/i18n/locale.ts`.
2. Añadir un catálogo completo por funcionalidad en `src/lib/i18n/catalogs/`,
   con las mismas claves y parámetros que español. No hay traducción automática.
3. Registrarlo en `catalogs` de `messages.ts`; su tipo exige todos los idiomas.
4. Añadir sus formatos regionales y pruebas. Ejecutar los gates y el guion E2E.

En componentes de cliente usar `useI18n()`; en páginas del servidor,
`await getI18n()`. Los auxiliares reciben traductor o locale explícitos.
No guardar el idioma de una petición en una variable global ni traducir texto
arbitrario del cliente. `systemText` sólo se usa al presentar etiquetas del
sistema o errores conocidos; los códigos y las respuestas de integración no cambian.

## Compatibilidad de configuración

`branding.locale` vive dentro de `organization.metadata`. No hay tabla ni
migración nueva. GET de marca devuelve el campo normalizado; PUT acepta el
campo opcional y, si se omite, conserva el idioma guardado. La validación rechaza
códigos desconocidos. Otros metadatos, opciones de marca y favicon se conservan.

La validación funcional se ejecuta con `node --env-file=.env.i18n scripts/e2e-idiomas.mjs`
sobre una instancia local descartable con `WA_MOCK_ENABLED=true`.
El guion crea cuentas de prueba y datos demo, revisa escritorio/móvil y guarda
capturas en `.tmp/i18n-screens/`; no conecta canales ni envía mensajes.
