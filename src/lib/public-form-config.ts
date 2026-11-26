import { z } from "zod";

export const publicFormKindSchema = z.enum(["contact", "booking"]);
export type PublicFormKind = z.infer<typeof publicFormKindSchema>;

export const publicFormFieldKeySchema = z.enum(["name", "phone", "email"]);
export type PublicFormFieldKey = z.infer<typeof publicFormFieldKeySchema>;

const fieldSchema = z.object({
  key: publicFormFieldKeySchema,
  label: z.string().trim().min(1).max(60),
  enabled: z.boolean(),
  required: z.boolean(),
  position: z.number().int().min(0).max(2),
});

export const publicFormConfigSchema = z
  .object({
    version: z.literal(1),
    title: z.string().trim().min(1).max(80),
    description: z.string().trim().max(240),
    submitLabel: z.string().trim().min(1).max(40),
    fields: z.array(fieldSchema).length(3),
  })
  .superRefine((config, context) => {
    const byKey = new Map(config.fields.map((field) => [field.key, field]));
    const positions = new Set(config.fields.map((field) => field.position));
    if (byKey.size !== 3 || positions.size !== 3) {
      context.addIssue({ code: "custom", message: "Los campos deben ser únicos y tener orden único" });
      return;
    }
    for (const key of ["name", "phone"] as const) {
      const field = byKey.get(key);
      if (!field?.enabled || !field.required) {
        context.addIssue({
          code: "custom",
          path: ["fields"],
          message: "Nombre y teléfono deben permanecer visibles y obligatorios",
        });
      }
    }
    const email = byKey.get("email");
    if (email && !email.enabled && email.required) {
      context.addIssue({
        code: "custom",
        path: ["fields"],
        message: "El correo oculto no puede ser obligatorio",
      });
    }
  });

export type PublicFormConfig = z.infer<typeof publicFormConfigSchema>;

export const DEFAULT_PUBLIC_FORM_CONFIG: Record<PublicFormKind, PublicFormConfig> = {
  contact: {
    version: 1,
    title: "Hablemos",
    description: "Déjanos tus datos y el equipo te contactará.",
    submitLabel: "Enviar mis datos",
    fields: [
      { key: "name", label: "Nombre", enabled: true, required: true, position: 0 },
      { key: "phone", label: "Teléfono", enabled: true, required: true, position: 1 },
      { key: "email", label: "Correo", enabled: true, required: false, position: 2 },
    ],
  },
  booking: {
    version: 1,
    title: "Agenda tu cita",
    description: "Elige una fecha y horario disponibles para confirmar tu cita.",
    submitLabel: "Confirmar cita",
    fields: [
      { key: "name", label: "Nombre", enabled: true, required: true, position: 0 },
      { key: "phone", label: "Teléfono", enabled: true, required: true, position: 1 },
      { key: "email", label: "Correo", enabled: true, required: false, position: 2 },
    ],
  },
};

/** Configuración antigua o incompleta: usar defaults sin confiar en HTML guardado. */
export function resolvePublicFormConfig(value: unknown, kind: PublicFormKind): PublicFormConfig {
  const parsed = publicFormConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_PUBLIC_FORM_CONFIG[kind];
}

/** Solo HTTPS en producción; HTTP se permite en localhost para desarrollo. */
export function normalizeAllowedOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim());
    const localHttp = url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      (url.protocol !== "https:" && !localHttp) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}
