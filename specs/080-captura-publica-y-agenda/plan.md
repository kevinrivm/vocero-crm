# Implementation Plan: Captura pública, etiquetas y agenda

**Branch**: `codex/forms-vocero-2.12.0` | **Date**: 2026-11-25 | **Spec**: [spec.md](spec.md)

## Summary

Extender el CRM existente con etiquetas, correo opcional y formularios públicos para captura y citas. Los formularios comparten los contactos, leads y el motor de agenda que ya existen. Se publican por slug de organización, se habilitan explícitamente y se pueden insertar con un widget JavaScript aislado en Shadow DOM. El webhook server-to-server usa un secreto aleatorio guardado como hash.

## Technical Context

**Language/Version**: TypeScript, Node.js 20+, Next.js 15, React 19<br>
**Primary Dependencies**: Next.js App Router, Drizzle ORM, Zod, PostgreSQL 16<br>
**Storage**: PostgreSQL de la instancia<br>
**Testing**: Guiones E2E y unitarios existentes; no agregar dependencias<br>
**Target Platform**: Docker o Node.js self-hosted detrás del proxy del dominio<br>
**Project Type**: Aplicación web monolítica con API y panel Next.js<br>
**Performance Goals**: Consultas públicas acotadas al rango máximo configurado; formularios síncronos con respuestas pequeñas<br>
**Constraints**: Autorización por organización, agenda opt-in, sin servicios externos nuevos, validación Zod, migración aditiva<br>
**Scale/Scope**: Una instancia sirve a un negocio, con aislamiento por `organization_id`

## Constitution Check

- Aislamiento: cada tabla nueva incluye `organization_id`; consultas autenticadas usan `scoped()`.
- Soberanía: no se agregan servicios ni dependencias de terceros.
- Integraciones: el secreto webhook se genera con Node crypto, se guarda como hash y no se vuelve a mostrar por GET.
- Idempotencia: teléfono normalizado reutiliza contactos; índice único de agenda impide citas duplicadas.
- Migraciones: aditivas y aplicadas por el mecanismo de arranque existente.
- UX: formularios accesibles con etiquetas asociadas, errores anunciables y validación tanto de navegador como de servidor.

## Project Structure

```text
src/app/(app)/settings/forms/                 # Constructor, URLs, etiquetas, orígenes y widget
src/app/(app)/contacts/                       # Lista, filtro y edición de etiquetas
src/app/forms/[slug]/contact/                 # Captura pública
src/app/forms/[slug]/booking/                 # Reserva pública
src/app/api/settings/forms/                   # Configuración autenticada
src/app/api/contact-tags/                      # Etiquetas autenticadas
src/app/api/public/forms/[slug]/               # Disponibilidad y formularios
src/app/api/webhooks/forms/[slug]/             # Integración autenticada por secreto
src/server/public-forms/                       # Resolución, captura y seguridad
src/lib/db/schema.ts                           # Nuevas tablas y columna opcional
drizzle/                                       # Migración aditiva
specs/080-captura-publica-y-agenda/            # Diseño y contratos
```

## Phase 0: Research

Decisiones registradas en [research.md](research.md): reutilizar agenda y contacto, el formulario público queda apagado por defecto, widget de datos estructurados sin HTML ejecutable, orígenes exactos para CORS, y secreto webhook con hash SHA-256.

## Phase 1: Design

- [Data model](data-model.md)
- [Public forms and webhook contract](contracts/public-forms.md)
- [Contact tags contract](contracts/contact-tags.md)
- [Quickstart](quickstart.md)

## Phase 2: Implementation

Las tareas ejecutables están en [tasks.md](tasks.md). La especificación y los contratos preceden cualquier cambio de esquema.
