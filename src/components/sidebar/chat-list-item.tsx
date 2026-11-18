"use client";

import type { Chat } from "@/types";
import { UserAvatar } from "@/components/shared/user-avatar";
import { formatChatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

interface ChatListItemProps {
  chat: Chat;
  isActive: boolean;
  onClick: () => void;
}

export function ChatListItem({ chat, isActive, onClick }: ChatListItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-wa-hover",
        isActive && "bg-wa-hover"
      )}
    >
      <UserAvatar name={chat.contact.name} size="lg" />
      <div className="min-w-0 flex-1 border-b border-border/50 pb-3">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-medium text-foreground">
            {chat.contact.name}
          </span>
          {chat.lastMessageTime && (
            <span
              className={cn(
                "shrink-0 text-xs",
                chat.unreadCount > 0
                  ? "font-medium text-wa-accent"
                  : "text-muted-foreground"
              )}
            >
              {formatChatTime(chat.lastMessageTime)}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className="truncate text-sm text-muted-foreground">
            {chat.lastMessage}
          </p>
          {chat.unreadCount > 0 && (
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-wa-accent px-1.5 text-xs font-medium text-white">
              {chat.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
