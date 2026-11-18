"use client";
import { useState, useMemo } from "react";
import { UserAvatar } from "@/components/shared/user-avatar";
import { PanelHeader } from "./panel-header";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search } from "lucide-react";
import { useChat } from "@/context/chat-context";
export function ContactsPanel() {
  const { chats, setActiveChatId } = useChat(); const [query, setQuery] = useState("");
  const contacts = useMemo(() => { const q = query.trim().toLowerCase(); return chats.filter(chat => !q || chat.contact.name.toLowerCase().includes(q) || chat.contact.username?.toLowerCase().includes(q)); }, [chats, query]);
  return <div className="flex min-h-0 flex-1 flex-col"><PanelHeader title="جهات الاتصال" showLogo={false}/><div className="relative px-3 pb-2"><Search className="absolute right-6 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input placeholder="ابحث عن جهة اتصال" value={query} onChange={e => setQuery(e.target.value)} className="h-9 rounded-lg border-none bg-wa-header pr-10 text-sm focus-visible:ring-0" dir="rtl"/></div><ScrollArea className="flex-1"><p className="px-4 py-2 text-xs font-medium text-muted-foreground">{contacts.length} جهة اتصال</p>{contacts.map(chat => <button key={chat.id} onClick={() => setActiveChatId(chat.id)} className="flex w-full items-center gap-3 px-4 py-3 text-right hover:bg-wa-hover"><UserAvatar name={chat.contact.name} size="lg" showOnline isOnline={chat.contact.status === "online"}/><div className="min-w-0 flex-1 border-b border-border/50 pb-3"><p className="truncate font-medium text-foreground">{chat.contact.name}</p><p className="truncate text-sm text-muted-foreground">{chat.contact.username ? `@${chat.contact.username}` : chat.contact.status === "online" ? "متصل الآن" : "غير متصل"}</p></div></button>)}</ScrollArea></div>;
}
