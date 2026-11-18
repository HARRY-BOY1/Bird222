"use client";

import { useChat } from "@/context/chat-context";
import { ChatListItem } from "./chat-list-item";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ChatListProps {
  onSelectChat: (chatId: string) => void;
}

export function ChatList({ onSelectChat }: ChatListProps) {
  const { filteredChats, activeChatId } = useChat();

  if (filteredChats.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
        No chats found
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div>
        {filteredChats.map((chat) => (
          <ChatListItem
            key={chat.id}
            chat={chat}
            isActive={chat.id === activeChatId}
            onClick={() => onSelectChat(chat.id)}
          />
        ))}
      </div>
    </ScrollArea>
  );
}
