import {
  BarChart3,
  Blocks,
  Bot,
  Building2,
  Calendar,
  CalendarDays,
  ChartColumn,
  CreditCard,
  FlaskConical,
  Inbox,
  Instagram,
  Kanban,
  LayoutDashboard,
  ListChecks,
  MessageCircle,
  Palette,
  Plug,
  Radio,
  Settings,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import { canConfigure, isAgentOnly, isSuperAdmin, isSupportProfile } from "@/lib/auth/roles";

/**
 * #87 — El modelo del menú, separado del componente que lo pinta.
 *
 * Qué entradas existen lo deciden dos cosas que el nav de cliente no puede
 * leer solo: las banderas de la instancia (`AGENDA`, `CHANNELS`, `ATRIBUCION`,
 * que bajan por prop desde el servidor) y el rol de quien mira. Tenerlo aquí,
 * sin React, deja que una prueba unitaria afirme qué aparece y qué no sin
 * dibujar nada.
 */

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Muestra el contador de no leídos (solo la Bandeja). */
  badge?: boolean;
  channel?: string;
  subItem?: boolean;
};

export type NavGroup = {
  /** Encabezado pequeño; sin él, el grupo es una entrada suelta. */
  title?: string;
  items: NavItem[];
};

/** La única entrada que va abajo, separada del resto. */
export const SETTINGS_ITEM: NavItem = {
  href: "/settings",
  label: "Ajustes",
  icon: Settings,
};

/**
 * Menú lateral exclusivo para clientes (Tenant Admin y Agentes)
 * 1. Operaciones:
 *    - Para perfiles de Soporte: Bandeja General + bandejas individuales por canal vinculado (WhatsApp, Messenger, etc.)
 *    - Para otros perfiles: Bandeja de Entrada unificada
 *    - Base de Contactos (/contacts)
 * 2. Configuración CRM: Embudos y Etiquetas (/crm-settings) [solo admin/owner]
 * 3. Administración: Conexión WhatsApp (/whatsapp-setup), Equipo de Trabajo (/team), Mi Suscripción (/subscription) [solo admin/owner]
 */
export function tenantNavGroups({
  role,
  userName,
  linkedChannels = ["whatsapp"],
  agenda = false,
  permissions,
}: {
  role?: string | null;
  userName?: string | null;
  linkedChannels?: readonly string[];
  agenda?: boolean;
  permissions?: {
    agenda?: boolean;
    contacts?: boolean;
    pipeline?: boolean;
    crm_settings?: boolean;
    [key: string]: boolean | undefined;
  } | null;
}): NavGroup[] {
  const isSupport = isSupportProfile(role, userName);
  const allowAgenda = agenda && permissions?.agenda !== false;
  const allowContacts = permissions?.contacts !== false;
  const allowPipeline = permissions?.pipeline !== false;
  const operaciones: NavItem[] = [];

  if (isSupport) {
    operaciones.push({
      href: "/inbox",
      label: "Bandeja General",
      icon: Inbox,
      badge: true,
    });

    const uniqueChannels = Array.from(new Set(linkedChannels));
    for (const ch of uniqueChannels) {
      const channelLower = ch.toLowerCase();
      if (channelLower === "whatsapp") {
        operaciones.push({
          href: "/inbox?channel=whatsapp",
          label: "WhatsApp",
          icon: Smartphone,
          badge: false,
          channel: "whatsapp",
        });
      } else if (channelLower === "messenger") {
        operaciones.push({
          href: "/inbox?channel=messenger",
          label: "Messenger",
          icon: MessageCircle,
          badge: false,
          channel: "messenger",
        });
      } else if (channelLower === "instagram") {
        operaciones.push({
          href: "/inbox?channel=instagram",
          label: "Instagram",
          icon: Instagram,
          badge: false,
          channel: "instagram",
        });
      } else if (channelLower === "tiktok") {
        operaciones.push({
          href: "/inbox?channel=tiktok",
          label: "TikTok",
          icon: Radio,
          badge: false,
          channel: "tiktok",
        });
      }
    }

    if (allowContacts) {
      operaciones.push({
        href: "/contacts",
        label: "Base de Contactos",
        icon: Users,
      });
    }

    if (allowPipeline) {
      operaciones.push({
        href: "/pipeline",
        label: "Pipeline",
        icon: Kanban,
      });
    }
  } else {
    operaciones.push({
      href: "/inbox",
      label: "Bandeja de Entrada",
      icon: Inbox,
      badge: true,
    });

    if (allowContacts) {
      operaciones.push({
        href: "/contacts",
        label: "Base de Contactos",
        icon: Users,
      });
    }

    if (allowPipeline) {
      operaciones.push({
        href: "/pipeline",
        label: "Pipeline",
        icon: Kanban,
      });
    }
  }

  if (allowAgenda) {
    operaciones.push({
      href: "/bookings",
      label: "Citas",
      icon: Calendar,
    });
  }

  if (isAgentOnly(role)) {
    return [
      {
        title: "Operaciones",
        items: operaciones,
      },
    ];
  }

  return [
    {
      title: "Operaciones",
      items: operaciones,
    },
    {
      title: "Configuración CRM",
      items: [
        {
          href: "/crm-settings",
          label: "Embudos y Etiquetas",
          icon: Kanban,
        },
      ],
    },
    {
      title: "Administración",
      items: [
        {
          href: "/ai-agent",
          label: "Agente IA",
          icon: Bot,
        },
        {
          href: "/integrations",
          label: "Canales & API",
          icon: Plug,
        },
        {
          href: "/team",
          label: "Equipo de Trabajo",
          icon: ShieldCheck,
        },
        {
          href: "/appearance",
          label: "Marca y Apariencia",
          icon: Palette,
        },
        {
          href: "/subscription",
          label: "Mi Suscripción",
          icon: CreditCard,
        },
        ...(allowAgenda
          ? [
              {
                href: "/settings/calendar",
                label: "Agenda",
                icon: Calendar,
              },
            ]
          : []),
      ],
    },
  ];
}

/**
 * Grupos de la barra lateral, en el orden en que se leen: lo que se atiende
 * cada día, lo que configura al agente y, al final, cómo va el negocio.
 */
export function appNavGroups({
  agenda = false,
  role,
  isSuperAdmin: superAdmin = false,
}: {
  /** 015 — "Citas" solo existe si esta instancia encendió la agenda. */
  agenda?: boolean;
  /** #86 — La guía de inicio solo para quien puede configurar. */
  role?: string | null;
  /** Acceso al panel global de superadmin. */
  isSuperAdmin?: boolean;
}): NavGroup[] {
  // Si el usuario es Súper Admin, ve el menú completo del SaaS global organizado por categorías
  if (superAdmin || isSuperAdmin(role)) {
    return [
      {
        title: "Visión General",
        items: [
          {
            href: "/superadmin",
            label: "Panel General",
            icon: LayoutDashboard,
          },
          {
            href: "/superadmin/analytics",
            label: "Analítica",
            icon: BarChart3,
          },
        ],
      },
      {
        title: "Comunicaciones",
        items: [
          {
            href: "/superadmin/whatsapp",
            label: "Estado WhatsApp",
            icon: Smartphone,
          },
          {
            href: "/superadmin/broadcast",
            label: "Transmisión",
            icon: Radio,
          },
        ],
      },
      {
        title: "Gestión de Clientes",
        items: [
          {
            href: "/superadmin/users",
            label: "Gestión de Usuarios",
            icon: Users,
          },
          {
            href: "/superadmin/modules",
            label: "Gestión de Módulos",
            icon: Blocks,
          },
          {
            href: "/superadmin/billing",
            label: "Facturación",
            icon: CreditCard,
          },
        ],
      },
      {
        title: "Sistema",
        items: [
          {
            href: "/superadmin/settings",
            label: "Ajustes Globales",
            icon: Settings,
          },
        ],
      },
    ];
  }

  // Un agente solo atiende chats (Bandeja y próximamente Chat Interno)
  if (isAgentOnly(role)) {
    return [
      {
        title: "Trabajo",
        items: [{ href: "/inbox", label: "Bandeja", icon: Inbox, badge: true }],
      },
    ];
  }

  const trabajo: NavItem[] = [
    { href: "/inbox", label: "Bandeja", icon: Inbox, badge: true },
    { href: "/pipeline", label: "Pipeline", icon: Kanban },
    { href: "/contacts", label: "Contactos", icon: Users },
  ];
  // Citas va después de Contactos: es el paso siguiente de un trato, no una
  // sección aparte.
  if (agenda) trabajo.push({ href: "/bookings", label: "Citas", icon: CalendarDays });

  const agente: NavItem[] = [];
  // Un miembro del equipo no puede hacer ninguno de los pasos de la guía.
  if (canConfigure(role)) {
    agente.push({ href: "/onboarding", label: "Guía de inicio", icon: ListChecks });
  }
  agente.push(
    { href: "/agent", label: "Agente", icon: Sparkles },
    { href: "/lab", label: "Laboratorio", icon: FlaskConical }
  );

  const groups: NavGroup[] = [
    { title: "Trabajo", items: trabajo },
    { title: "Agente", items: agente },
    // 019 — Se mide al final: primero se atiende y se organiza.
    { items: [{ href: "/results", label: "Resultados", icon: ChartColumn }] },
  ];

  return groups;
}

export type SettingsLink = { href: string; label: string };

export type SettingsSection = {
  title: string;
  links: SettingsLink[];
};

/**
 * Ajustes en tres secciones: por dónde entran los mensajes, qué hace el agente
 * con ellos y lo que es del negocio. Una pestaña por canal no escala; una
 * sección por canal, sí: cada canal nuevo cae en "Canales" sin tocar el resto.
 *
 * Instagram no tiene pantalla propia todavía: sus credenciales se guardan
 * por API (`/api/settings/instagram`). Cuando la tenga, va aquí tras
 * `CHANNELS`, igual que Messenger.
 */
export function settingsSections({
  agenda = false,
  atribucion = false,
  instagram = false,
  messenger = false,
  tiktok = false,
}: {
  agenda?: boolean;
  /** 016 — "Anuncios" existe solo con la bandera ATRIBUCION. */
  atribucion?: boolean;
  /** 023 — "Instagram" solo si el canal está encendido con CHANNELS. */
  instagram?: boolean;
  /** 017 — "Messenger", igual. */
  messenger?: boolean;
  /** 022 — "TikTok", igual: solo con el canal en CHANNELS. */
  tiktok?: boolean;
}): SettingsSection[] {
  const canales: SettingsLink[] = [];
  // 023 — "Estado" reúne todos los canales; con WhatsApp solo no aporta nada
  // que su pantalla no diga, así que no existe (ADR-001).
  if (instagram || messenger || tiktok) {
    canales.push({ href: "/settings/channels", label: "Estado" });
  }
  canales.push({ href: "/settings/whatsapp", label: "WhatsApp" });
  if (instagram) canales.push({ href: "/settings/instagram", label: "Instagram" });
  if (messenger) canales.push({ href: "/settings/messenger", label: "Messenger" });
  if (tiktok) canales.push({ href: "/settings/tiktok", label: "TikTok" });

  // #85 — el proveedor de IA se configura aquí; el entorno queda de respaldo.
  const agente: SettingsLink[] = [{ href: "/settings/ai", label: "IA" }];
  if (agenda) agente.push({ href: "/settings/calendar", label: "Agenda" });

  const negocio: SettingsLink[] = [
    { href: "/settings/branding", label: "Marca" },
    // 062 — Tema, letra, tamaño y densidad (cada quien la suya).
    { href: "/settings/appearance", label: "Apariencia" },
    { href: "/settings/templates", label: "Plantillas" },
    // 049 — lo que el equipo inserta con «/atajo» en la Bandeja.
    { href: "/settings/quick-replies", label: "Respuestas rápidas" },
    { href: "/settings/team", label: "Equipo" },
  ];
  if (atribucion) negocio.push({ href: "/settings/ads", label: "Anuncios" });

  return [
    { title: "Canales", links: canales },
    { title: "Agente", links: agente },
    { title: "Negocio", links: negocio },
  ];
}

/** Activa si la ruta es la entrada o cuelga de ella (`/inbox/cv_123`). */
export function isNavActive(
  pathname: string,
  href: string,
  currentChannel?: string | null
): boolean {
  if (href.startsWith("/inbox")) {
    const isInboxPath = pathname === "/inbox" || pathname.startsWith("/inbox/");
    if (!isInboxPath) return false;

    if (href === "/inbox") {
      // Activa si estamos en la bandeja y no hay filtro específico de canal activo
      return !currentChannel || currentChannel === "all";
    }

    const [path, query] = href.split("?");
    if (path === "/inbox" && query) {
      const itemChannel = new URLSearchParams(query).get("channel");
      return (
        currentChannel?.toLowerCase() === itemChannel?.toLowerCase()
      );
    }
  }

  if (href === "/superadmin") {
    return pathname === "/superadmin";
  }
  if (href === "/crm-settings") {
    return pathname === "/crm-settings" || pathname.startsWith("/crm-settings/");
  }
  if (href === "/pipeline") {
    return pathname === "/pipeline" || pathname.startsWith("/pipeline/");
  }
  if (href === "/ai-agent") {
    return (
      pathname === "/ai-agent" ||
      pathname.startsWith("/ai-agent/") ||
      pathname === "/onboarding" ||
      pathname.startsWith("/onboarding/")
    );
  }
  if (href === "/integrations" || href === "/whatsapp-setup") {
    return (
      pathname === "/integrations" ||
      pathname.startsWith("/integrations/") ||
      pathname === "/whatsapp-setup" ||
      pathname.startsWith("/whatsapp-setup/") ||
      pathname === "/settings/whatsapp" ||
      pathname.startsWith("/settings/whatsapp/")
    );
  }
  if (href === "/team") {
    return (
      pathname === "/team" ||
      pathname.startsWith("/team/") ||
      pathname === "/settings/team" ||
      pathname.startsWith("/settings/team/")
    );
  }
  if (href === "/appearance") {
    return (
      pathname === "/appearance" ||
      pathname.startsWith("/appearance/") ||
      pathname === "/tenant/appearance" ||
      pathname.startsWith("/tenant/appearance/") ||
      pathname === "/tenant/settings" ||
      pathname.startsWith("/tenant/settings/")
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
