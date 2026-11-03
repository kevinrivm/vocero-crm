export interface TenantChannelItem {
  id: string;
  name: string;
  platform: "whatsapp" | "evolution";
  providerId: string;
  token?: string | null;
  enableAi: boolean;
  status: string;
  createdAt: string;
}

export interface IntegrationsViewData {
  organizationId: string;
  organizationName: string;
  dispatchWebhookUrl: string;
  botApiKey: string;
  evoUrl: string;
  evoInstance: string;
  evoApiKey: string;
  channels: TenantChannelItem[];
  whatsapp: {
    connected: boolean;
    displayPhoneNumber: string | null;
    verifiedName: string | null;
    wabaId: string | null;
    status: string | null;
  };
  zernio: {
    connected: boolean;
    accountCount: number;
  };
}
