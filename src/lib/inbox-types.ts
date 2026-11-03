export interface InboxContactTag {
  id: string;
  name: string;
  color: string;
}

export interface InboxStage {
  id: string;
  name: string;
  color: string;
  kind?: string;
}

export interface InboxAgent {
  id: string;
  name: string;
  email: string;
}

export interface InboxConversationItem {
  id: string;
  channel: string;
  status: "open" | "closed" | "pending";
  unreadCount: number;
  lastMessageText: string | null;
  lastMessageAt: string | null;
  windowOpen: boolean;
  windowRemainingMs: number;
  aiEnabled: boolean;
  handoffAt: string | null;
  contact: {
    id: string;
    name: string;
    phone: string | null;
    waIdentity: string;
    notes: string | null;
    tags: InboxContactTag[];
    stage: InboxStage | null;
    assignedAgent: InboxAgent | null;
    createdAt: string;
  };
}

export interface InboxMessageItem {
  id: string;
  conversationId: string;
  direction: "in" | "out";
  type: string;
  text: string | null;
  status: "pending" | "sent" | "delivered" | "read" | "failed";
  error?: string | null;
  aiGenerated?: boolean;
  createdAt: string;
}

export interface InboxViewData {
  organizationId: string;
  organizationName: string;
  conversations: InboxConversationItem[];
  stages: InboxStage[];
  tags: InboxContactTag[];
  agents: InboxAgent[];
}

