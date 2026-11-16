# Datos y contrato interno
organization.metadata.branding.locale: es | pt-BR, opcional en datos antiguos; normaliza a es.
GET /api/settings/branding incluye branding.locale.
PUT admite locale opcional; desconocido → 422; omitido → conserva actual. No-owner → 403.
Se conservan favicon y metadatos ajenos a marca. Sin migración SQL.
Cookie vocero-locale guarda sólo preferencia explícita por navegador; no identifica usuarios.
pt-BR es el locale UI y pt_BR sigue siendo el código de Meta.
