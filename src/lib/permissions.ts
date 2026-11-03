/**
 * Definición de tipos, constantes y valores predeterminados para
 * el sistema de permisos por rol/perfil del tenant (RBAC).
 *
 * Módulo puro sin directiva "use server" para permitir exportar objetos
 * y constantes a componentes de cliente y servidor.
 */

export type TenantPermissionKey =
  | "agenda"
  | "contacts"
  | "pipeline"
  | "internal_chat"
  | "sticky_notes"
  | "export_contacts"
  | "crm_settings";

export type RolePermissionDef = {
  key: TenantPermissionKey;
  name: string;
  description: string;
  category: "Operaciones" | "Herramientas" | "Administración";
};

export const AVAILABLE_PERMISSIONS: RolePermissionDef[] = [
  {
    key: "pipeline",
    name: "Pipeline de Contactos (Embudo)",
    description: "Permite ver el tablero kanban de contactos y moverlos entre etapas del embudo comercial.",
    category: "Operaciones",
  },
  {
    key: "agenda",
    name: "Agenda y Citas",
    description: "Permite acceder al calendario, programar y atender citas y videollamadas.",
    category: "Operaciones",
  },
  {
    key: "contacts",
    name: "Base de Contactos",
    description: "Permite explorar y consultar la lista de contactos y clientes del negocio.",
    category: "Operaciones",
  },
  {
    key: "export_contacts",
    name: "Exportar Contactos a CSV",
    description: "Permite descargar la base de datos de contactos en formato CSV.",
    category: "Operaciones",
  },
  {
    key: "internal_chat",
    name: "Chat Interno de Equipo",
    description: "Permite comunicarse con otros agentes mediante canales y chats directos.",
    category: "Herramientas",
  },
  {
    key: "sticky_notes",
    name: "Notas Rápidas (Sticky Notes)",
    description: "Permite crear recordatorios y notas adhesivas personales.",
    category: "Herramientas",
  },
  {
    key: "crm_settings",
    name: "Embudos y Etiquetas",
    description: "Permite configurar fases de pipeline, estados de leads y etiquetas.",
    category: "Administración",
  },
];

export const DEFAULT_ROLE_PERMISSIONS: Record<
  "admin" | "sales" | "support",
  Record<TenantPermissionKey, boolean>
> = {
  admin: {
    agenda: true,
    contacts: true,
    pipeline: true,
    internal_chat: true,
    sticky_notes: true,
    export_contacts: true,
    crm_settings: true,
  },
  sales: {
    agenda: true,
    contacts: true,
    pipeline: true,
    internal_chat: true,
    sticky_notes: true,
    export_contacts: false,
    crm_settings: false,
  },
  support: {
    agenda: true, // El administrador puede desactivar esta opción para el perfil de soporte
    contacts: true,
    pipeline: true,
    internal_chat: true,
    sticky_notes: true,
    export_contacts: false,
    crm_settings: false,
  },
};

export type TenantPermissionsData = {
  permissions: RolePermissionDef[];
  matrix: {
    admin: Record<TenantPermissionKey, boolean>;
    sales: Record<TenantPermissionKey, boolean>;
    support: Record<TenantPermissionKey, boolean>;
    owner: Record<TenantPermissionKey, boolean>;
  };
};

