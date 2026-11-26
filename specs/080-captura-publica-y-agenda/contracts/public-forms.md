# Contract: Public forms and webhooks

## Admin configuration

- `GET /api/settings/forms` returns `{ settings, slug, urls, embed, tags, webhook: { endpoint, hasSecret } }`; `settings` includes both structured configs, allowed origins and tag IDs by form; secrets en claro nunca aparecen.
- `PUT /api/settings/forms` accepts enable switches, validated `contactFormConfig`/`bookingFormConfig`, exact `allowedOrigins`, and organization-owned `formTags` (`contact`/`booking`).
- `POST /api/settings/forms/webhook-secret` rotates the organization key and returns `{ secret }` once.
- `DELETE /api/settings/forms/webhook-secret` revokes the current key.

## Public page routes

- `GET /forms/[slug]/contact`: contact form page when enabled; otherwise not found.
- `GET /forms/[slug]/booking`: booking form page only when enabled and `AGENDA=on`; otherwise not found.
- Pages use the same public API. The copied embed snippet mounts `/vocero-form-widget.js` on a `<div data-vocero-form data-slug="…" data-kind="contact|booking">`; no iframe is created.
- A host page can set `--vocero-form-accent`, `--vocero-form-radius`, and `--vocero-form-font` on that div. The widget isolates its markup and CSS in Shadow DOM.

## Public HTTP API

- `POST /api/public/forms/[slug]/contacts`: JSON `{ name, phone, email?, website? }`; `201` for a new contact, `200` when the contact already exists, with `{ contact: { id, name }, created, leadCreated }`.
- `GET /api/public/forms/[slug]/config?kind=contact|booking`: returns only the public structured config and organization name. A browser `Origin` must be the CRM origin or an exact allowed origin. The config contains text only; it is never interpreted as HTML.
- `GET /api/public/forms/[slug]/availability?date=YYYY-MM-DD`: returns that day's available slots, bounded by the organization's `maxDaysAhead`, plus `{ timezone, today, maxDate, date, slots: [{ startUtc, endUtc, label, dayIso, dayLabel, time }] }`.
- `POST /api/public/forms/[slug]/bookings`: JSON `{ name, phone, email?, startUtc, notes?, website? }`; `201 { booking, contact }`. A taken slot responds `409 slot_taken`.

Public calls validate with Zod, reject a non-empty honeypot, and apply IP rate limits. No public endpoint returns CRM records or organization settings unrelated to the form. The phone is sent as digits with its international country code; the browser form strips formatting characters before submission.

Cross-origin widget requests support exact-origin CORS for the config, availability, contact, and booking routes. Configure HTTPS origins in Ajustes → Formularios before embedding. CORS limits browsers; public submissions still validate every field, use a honeypot, and apply rate limits. The widget does not receive the server-to-server webhook secret.

Successful submissions add the selected `formTags` for that form kind to the contact, preserving existing tag assignments. A booking submission applies booking tags only after a successful or idempotently repeated reservation.

The existing Vocero REST API remains available separately when `API_V1=on`:
`POST /api/v1/contacts` creates a contact and lead with a bearer key that has
the `operate` permission. `API_V1=on` is required. Keep that key on a server;
browser forms use the public form endpoint or the dedicated webhook secret
below.

## Server-to-server webhook

`POST /api/webhooks/forms/[slug]` with `Authorization: Bearer <secret>` and JSON body:

```json
{ "type": "contact", "name": "Ana", "phone": "5215512345678", "email": "ana@example.com" }
```

or

```json
{ "type": "booking", "name": "Ana", "phone": "5215512345678", "startUtc": "2026-12-03T16:00:00.000Z" }
```

The same validation and persistence services are used as in the browser flow. Webhook publication is enabled by generating a secret, independently of whether a hosted page is switched on. Contact identity makes contact submissions idempotent; the unique active booking slot plus contact/time lookup makes retries return the original booking instead of creating a second one. Invalid credentials return `401 unauthorized` without identifying the slug. A booking webhook still requires `AGENDA=on`; a lost slot returns `409 slot_taken`; invalid input returns `422 invalid_body`.
