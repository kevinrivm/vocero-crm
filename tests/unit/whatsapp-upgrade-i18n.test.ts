import { describe, expect, it } from "vitest";
import { systemText } from "@/lib/i18n";
describe("catálogo de WhatsApp 065/066", () => {
  it("traduce errores del Embedded Signup", () => {
    expect(systemText("pt-BR", "Meta no pudo completar la autorización. Revisa que META_APP_ID, META_APP_SECRET y la configuración de Embedded Signup sean de la misma app y vuelve a conectar.")).toContain("A Meta não conseguiu concluir a autorização");
    expect(systemText("pt-BR", "Ese número usa la API local antigua y requiere una migración. No se modificó nada.")).toContain("API local antiga");
  });
  it("traduce fallos conocidos del webhook y conserva errores técnicos", () => {
    expect(systemText("pt-BR", "No se pudo confirmar el webhook en la Cuenta de mensajes: Meta no está disponible en este momento; intenta de nuevo.")).toBe("Não foi possível confirmar o webhook na Conta de mensagens: a Meta não está disponível no momento; tente novamente.");
    expect(systemText("pt-BR", "No se pudo suscribir la app a la cuenta de WhatsApp: Unsupported request (code 100)")).toBe("Não foi possível inscrever o aplicativo na conta do WhatsApp: Unsupported request (code 100)");
  });
});
