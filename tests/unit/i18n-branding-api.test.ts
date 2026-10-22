import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BRANDING } from "@/lib/branding";
const mocks=vi.hoisted(()=>({session:vi.fn(),get:vi.fn(),save:vi.fn()}));
vi.mock("@/lib/auth/session",()=>({requireSession:mocks.session,getSessionOrNull:mocks.session,UnauthorizedError:class extends Error {}}));
vi.mock("@/server/branding",()=>({getBranding:mocks.get,saveBranding:mocks.save}));
import { GET, PUT } from "@/app/api/settings/branding/route";
beforeEach(()=>{vi.clearAllMocks();mocks.session.mockResolvedValue({organizationId:"org-a",userId:"owner-a",role:"owner"});mocks.get.mockResolvedValue({...DEFAULT_BRANDING,locale:"pt-BR",favicon:{mime:"image/png",version:4}});});
const request=(extra:object={})=>new Request("http://localhost/api/settings/branding",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({name:"Empresa",accent:"#123456",currency:"USD",...extra})});
describe("idioma de la organización por API",()=>{
 it("GET aditivo incluye locale",async()=>{expect((await (await GET()).json()).branding.locale).toBe("pt-BR");});
 it("un cliente antiguo no borra el idioma ni favicon",async()=>{expect((await PUT(request())).status).toBe(200);expect(mocks.save).toHaveBeenCalledWith("org-a",expect.objectContaining({locale:"pt-BR",currency:"USD",favicon:{mime:"image/png",version:4}}));});
 it("permite cambiar al propietario",async()=>{expect((await PUT(request({locale:"es"}))).status).toBe(200);expect(mocks.save).toHaveBeenCalledWith("org-a",expect.objectContaining({locale:"es"}));});
 it.each(["pt_BR","en","",null,123])("rechaza idioma inválido %s",async(locale)=>{expect((await PUT(request({locale}))).status).toBe(422);expect(mocks.save).not.toHaveBeenCalled();});
 it("un miembro no puede alterar el idioma",async()=>{mocks.session.mockResolvedValue({organizationId:"org-a",userId:"member-a",role:"member"});expect((await PUT(request({locale:"es"}))).status).toBe(403);expect(mocks.save).not.toHaveBeenCalled();});
});
