import { describe, expect, it } from "vitest";
import { formatBrazilianPhone, formatPhone } from "@/lib/utils";

describe("regionalización de presentación", () => {
  it("formatea números brasileños completos con código de país", () => {
    expect(formatBrazilianPhone("5511998765432")).toBe("+55 (11) 99876-5432");
    expect(formatBrazilianPhone("552132345678")).toBe("+55 (21) 3234-5678");
  });

  it("conserva números incompletos, extranjeros y no telefónicos", () => {
    expect(formatBrazilianPhone("5511998765")).toBe("5511998765");
    expect(formatBrazilianPhone("5215512345678")).toBe("5215512345678");
    expect(formatBrazilianPhone("ig:12345")).toBe("ig:12345");
    expect(formatBrazilianPhone("ig:5511998765432")).toBe("ig:5511998765432");
    expect(formatBrazilianPhone("55+11abc998765432")).toBe("55+11abc998765432");
    expect(formatBrazilianPhone("+55 (11) 99876-5432")).toBe("+55 (11) 99876-5432");
  });

  it("no duplica el signo + y localiza el teléfono ausente", () => {
    expect(formatPhone("+5215512345678", "pt-BR")).toBe("+5215512345678");
    expect(formatPhone("ig:5511998765432", "pt-BR")).toBe("ig:5511998765432");
    expect(formatPhone(null, "pt-BR")).toBe("Sem telefone");
    expect(formatPhone(null, "es")).toBe("Sin teléfono");
  });

});
