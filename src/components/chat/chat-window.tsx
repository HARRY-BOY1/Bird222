"use client";

import { useEffect, useRef } from "react";
import { useChat } from "@/context/chat-context";
import { ChatHeader } from "./chat-header";
import { MessageBubble } from "./message-bubble";
import { MessageInput } from "./message-input";
import { TypingIndicator } from "@/components/shared/typing-indicator";
import { EmptyState } from "./empty-state";

import { getChatThemeClass } from "@/lib/chat-themes";
import { cn } from "@/lib/utils";

interface ChatWindowProps {
  onBack?: () => void;
  showBack?: boolean;
}

export function ChatWindow({ onBack, showBack }: ChatWindowProps) {
  const { activeChat, isTyping, currentUser } = useChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeChat?.messages, isTyping]);

  if (!activeChat) {
    return (
      <div className="flex h-full w-full flex-1 flex-col">
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-1 flex-col">
      <ChatHeader chat={activeChat} onBack={onBack} showBack={showBack} />

      <div
        className={cn(
          "flex-1 overflow-y-auto px-4 py-4 md:px-8 lg:px-16",
          getChatThemeClass(activeChat.theme)
        )}
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-1">
          {activeChat.messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              isOwn={message.senderId === currentUser.id}
            />
          ))}
          {isTyping && (
            <div className="flex justify-start">
              <TypingIndicator />
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <MessageInput />
    </div>
  );
}
