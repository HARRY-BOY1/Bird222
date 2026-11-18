"use client";

import { ArrowLeft, Phone, Video, Search, MoreVertical } from "lucide-react";
import { useChat } from "@/context/chat-context";
import { UserAvatar } from "@/components/shared/user-avatar";
import { TypingIndicator } from "@/components/shared/typing-indicator";
import { Button } from "@/components/ui/button";
import type { Chat } from "@/types";

interface ChatHeaderProps {
  chat: Chat;
  onBack?: () => void;
  showBack?: boolean;
}

export function ChatHeader({ chat, onBack, showBack }: ChatHeaderProps) {
  const { isTyping } = useChat();
  const { contact } = chat;

  const statusText = isTyping
    ? "typing..."
    : contact.status === "online"
      ? "online"
      : contact.lastSeen ?? "offline";

  return (
    <header className="flex items-center gap-3 bg-wa-header px-2 py-2.5 lg:px-4">
      {showBack && (
        <Button
          variant="icon"
          size="icon"
          onClick={onBack}
          aria-label="Back to chats"
          className="lg:hidden"
        >
          <ArrowLeft className="h-5 w-5 text-muted-foreground" />
        </Button>
      )}

      <UserAvatar
        name={contact.name}
        size="md"
        showOnline
        isOnline={contact.status === "online"}
      />

      <div className="min-w-0 flex-1">
        <h2 className="truncate font-medium text-foreground">{contact.name}</h2>
        <div className="flex items-center text-xs text-muted-foreground">
          {isTyping ? (
            <>
              <span>typing</span>
              <TypingIndicator inline className="ml-0.5" />
            </>
          ) : (
            <span className="truncate">{statusText}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1">
        <Button variant="icon" size="icon" aria-label="Video call">
          <Video className="h-5 w-5 text-muted-foreground" />
        </Button>
        <Button variant="icon" size="icon" aria-label="Voice call">
          <Phone className="h-5 w-5 text-muted-foreground" />
        </Button>
        <Button variant="icon" size="icon" aria-label="Search in chat">
          <Search className="h-5 w-5 text-muted-foreground" />
        </Button>
        <Button variant="icon" size="icon" aria-label="More options">
          <MoreVertical className="h-5 w-5 text-muted-foreground" />
        </Button>
      </div>
    </header>
  );
}
