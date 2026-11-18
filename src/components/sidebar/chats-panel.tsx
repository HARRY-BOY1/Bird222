"use client";

import { SearchBar } from "./search-bar";
import { ChatList } from "./chat-list";
import { PanelHeader } from "./panel-header";

interface ChatsPanelProps {
  onSelectChat: (chatId: string) => void;
}

export function ChatsPanel({ onSelectChat }: ChatsPanelProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader />
      <SearchBar />
      <ChatList onSelectChat={onSelectChat} />
    </div>
  );
}
