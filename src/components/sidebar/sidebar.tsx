"use client";

import type { SidebarTab } from "@/types";
import { ChatsPanel } from "./chats-panel";
import { StatusPanel } from "./status-panel";
import { ContactsPanel } from "./contacts-panel";
import { CallHistoryPanel } from "./call-history-panel";
import { SidebarNav } from "./sidebar-nav";

interface SidebarProps {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  onSelectChat: (chatId: string) => void;
}

export function Sidebar({ activeTab, onTabChange, onSelectChat }: SidebarProps) {
  return (
    <div className="flex h-full w-full flex-col border-r border-border bg-wa-sidebar">
      {activeTab === "chats" && <ChatsPanel onSelectChat={onSelectChat} />}
      {activeTab === "status" && <StatusPanel />}
      {activeTab === "contacts" && <ContactsPanel />}
      {activeTab === "calls" && <CallHistoryPanel />}

      <SidebarNav activeTab={activeTab} onTabChange={onTabChange} />
    </div>
  );
}
