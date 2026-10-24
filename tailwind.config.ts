import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

/**
 * Los nombres semánticos existentes (background, primary, muted…) se remapean
 * a los tokens del sistema de diseño de Vocero (la marca de vocerocrm.com) para
 * que toda la app comparta el tema activo (claro u oscuro, ver globals.css);
 * la escala `brand-*` expone el acento white-label y las escalas de estado
 * exponen la tríada tint/soft/text.
 *
 * Dos reglas para no romper el tema oscuro:
 * 1. Nada de colores literales en la UI (`text-white`, `bg-black`, hex suelto).
 *    Excepción deliberada: la paleta de identidad (avatares, palomita azul de
 *    WhatsApp) son tonos medios legibles en ambos temas. Los puntos de etapa
 *    ya no lo son: salen de los tokens del tema y siguen al acento.
 * 2. Nada de modificador de opacidad (`bg-brand/20`) sobre estos nombres:
 *    Tailwind 3 no sabe aplicarlo a un color `var(--x)` y descarta la regla en
 *    silencio. Usa un token propio (p. ej. `--accent-veil`) o `opacity-*`.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        input: "var(--border-strong)",
        // En claro es el acento; en oscuro, su variante aclarada: el acento
        // sólido queda bajo 3:1 sobre la fila seleccionada y los diálogos.
        ring: "var(--ring)",
        background: "var(--bg)",
        foreground: "var(--text)",
        subtle: "var(--bg-subtle)",
        primary: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-fg)",
        },
        secondary: {
          DEFAULT: "var(--bg-panel)",
          foreground: "var(--text-2)",
        },
        destructive: {
          DEFAULT: "var(--danger)",
          foreground: "var(--danger-fg)",
        },
        muted: {
          DEFAULT: "var(--bg-panel)",
          foreground: "var(--text-3)",
        },
        accent: {
          DEFAULT: "var(--bg-hover)",
          foreground: "var(--text)",
        },
        card: {
          DEFAULT: "var(--bg)",
          foreground: "var(--text)",
        },
        // Lo que flota (diálogos, cajones, menús): en oscuro, un escalón
        // arriba de la página para que se despegue; en claro, el mismo blanco.
        popover: {
          DEFAULT: "var(--bg-raised)",
          foreground: "var(--text)",
        },
        brand: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
          soft: "var(--accent-soft)",
          tint: "var(--accent-tint)",
          text: "var(--accent-text)",
          fg: "var(--accent-fg)",
          // El acento como texto (una hora, un enlace): legible en los dos temas.
          ink: "var(--accent-ink)",
          veil: "var(--accent-veil)",
        },
        quote: {
          DEFAULT: "var(--quote-bg)",
          hover: "var(--quote-bg-hover)",
        },
        "text-2": "var(--text-2)",
        "text-3": "var(--text-3)",
        "text-4": "var(--text-4)",
        chat: "var(--chat-bg)",
        "bubble-in": "var(--bubble-in)",
        "bubble-in-border": "var(--bubble-in-border)",
        "bubble-out": "var(--bubble-out)",
        "bubble-out-border": "var(--bubble-out-border)",
        "bubble-out-text": "var(--bubble-out-text)",
        // 061 — Diseño de tarjetas.
        "bubble-in-text": "var(--bubble-in-text)",
        activo: "var(--bg-active)",
        riel: {
          activo: "var(--riel-activo)",
          "activo-texto": "var(--riel-activo-texto)",
        },
        enviar: {
          DEFAULT: "var(--enviar)",
          texto: "var(--enviar-texto)",
        },
        success: {
          DEFAULT: "var(--success)",
          tint: "var(--success-tint)",
          soft: "var(--success-soft)",
          text: "var(--success-text)",
        },
        warning: {
          DEFAULT: "var(--warning)",
          tint: "var(--warning-tint)",
          soft: "var(--warning-soft)",
          text: "var(--warning-text)",
        },
        danger: {
          DEFAULT: "var(--danger)",
          tint: "var(--danger-tint)",
          soft: "var(--danger-soft)",
          text: "var(--danger-text)",
        },
        info: {
          DEFAULT: "var(--info)",
          tint: "var(--info-tint)",
          soft: "var(--info-soft)",
          text: "var(--info-text)",
        },
        overlay: "var(--overlay)",
        knob: "var(--knob)",
        chip: "var(--chip-bg)",
        "row-hover": "var(--row-hover)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius)",
        lg: "var(--radius-lg)",
        tarjeta: "var(--radio-tarjeta)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        pop: "var(--shadow-pop)",
        tarjeta: "var(--sombra-tarjeta)",
      },
      // Las tres voces de la marca (ver src/app/layout.tsx, donde next/font
      // las descarga en build y las sirve self-hosted, sin CDN en runtime).
      fontFamily: {
        sans: ["var(--font-sans)", "Archivo", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        serif: ["var(--font-serif)", "Instrument Serif", "Georgia", "serif"],
        mono: ["var(--font-mono)", "IBM Plex Mono", "ui-monospace", "Cascadia Code", "monospace"],
      },
    },
  },
  plugins: [animate],
};

export default config;
