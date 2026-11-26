# Quickstart: Captura pública, etiquetas y agenda

## Publicar una captura de contacto

1. Despliega esta versión basada en Vocero 2.12.0. El contenedor aplica `0033_public_forms_contact_tags` y `0034_public_forms_widget_config` al arrancar junto con cualquier migración oficial pendiente. En desarrollo local, `pnpm db:migrate` aplica las migraciones.
2. Abre **Ajustes → Formularios** y activa **Captura de contactos**.
3. Copia el enlace `/forms/<slug>/contact` para compartirlo o el widget JavaScript para incrustarlo. Para usarlo en otra web, añade su origen HTTPS exacto en la lista autorizada.
4. Envía una captura de prueba; el contacto debe aparecer en Contactos y el lead en Pipeline.

## Publicar la agenda

1. Inicia Vocero con `AGENDA=on` y configura la disponibilidad en **Ajustes → Agenda**.
2. En **Ajustes → Formularios**, activa **Reservas de citas**.
3. Copia el enlace `/forms/<slug>/booking` o su widget JavaScript; autoriza primero el origen de la web externa.
4. Confirma una cita y revisa que la hora se muestra en la zona del negocio.

## Conectar un webhook

1. En Ajustes → Formularios, genera o rota el secreto y guárdalo en el gestor de secretos del sistema externo.
2. Envía `POST /api/webhooks/forms/<slug>` con `Authorization: Bearer <secreto>` y JSON del contrato.
3. No incluyas el secreto en páginas, JavaScript cliente, repositorios ni logs.

Para automatizaciones que ya corren en un servidor también se puede usar
`POST /api/v1/contacts` con una llave bearer que tenga permiso `operate` y
`API_V1=on`. La llave debe permanecer en el servidor; no la publiques en el
navegador.

## Etiquetar contactos

En Contactos abre **Editar**, crea una etiqueta si todavía no existe y selecciónala. La lista permite filtrar por etiqueta.
