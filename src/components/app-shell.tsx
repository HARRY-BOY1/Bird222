"use client";

import { useState } from "react";
import { useChat } from "@/context/chat-context";
import { Sidebar } from "@/components/sidebar/sidebar";
import { ChatWindow } from "@/components/chat/chat-window";
import type { SidebarTab } from "@/types";
import { cn } from "@/lib/utils";

export function AppShell() {
  const { setActiveChatId, isHydrated } = useChat();
  const [showChat, setShowChat] = useState(false);
  const [activeTab, setActiveTab] = useState<SidebarTab>("chats");

  const handleSelectChat = (chatId: string) => {
    setActiveChatId(chatId);
    setActiveTab("chats");
    setShowChat(true);
  };

  const handleTabChange = (tab: SidebarTab) => {
    setActiveTab(tab);
    if (tab !== "chats") {
      setShowChat(false);
    }
  };

  const handleBack = () => {
    setShowChat(false);
  };

  const showChatPanel =
    activeTab === "chats" ? showChat : false;

  if (!isHydrated) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-wa-accent border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading chats...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      <aside
        className={cn(
          "h-full shrink-0",
          "w-full lg:w-[30%] lg:min-w-[360px] lg:max-w-[440px]",
          showChatPanel ? "hidden lg:flex lg:flex-col" : "flex flex-col"
        )}
      >
        <Sidebar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onSelectChat={handleSelectChat}
        />
      </aside>

      <main
        className={cn(
          "h-full min-w-0 flex-1",
          showChatPanel ? "flex" : "hidden lg:flex"
        )}
      >
        <ChatWindow onBack={handleBack} showBack={showChatPanel} />
      </main>
    </div>
  );
}
