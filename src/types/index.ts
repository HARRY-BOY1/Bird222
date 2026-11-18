export type MessageStatus = "sent" | "delivered" | "read";
export type ChatThemeId = "default" | "ocean" | "forest" | "sunset" | "lavender";
export interface User { id: string; name: string; username?: string; avatar?: string; status: "online" | "offline" | "typing"; lastSeen?: string; }
export interface Message { id: string; chatId: string; text: string; timestamp: number; senderId: string; status: MessageStatus; kind?: string; attachmentId?: string; attachmentName?: string; }
export interface Chat { id: string; contact: User; messages: Message[]; unreadCount: number; lastMessage?: string; lastMessageTime?: number; theme?: ChatThemeId; }
export interface ChatState { chats: Chat[]; activeChatId: string | null; currentUser: User; }
export type SidebarTab = "chats" | "status" | "contacts" | "calls";
export type CallType = "incoming" | "outgoing" | "missed";
export interface CallLogEntry { id: string; contact: User; type: CallType; timestamp: number; duration?: number; }
export interface StatusUpdate { id: string; contact: User; timestamp: number; viewed: boolean; }
