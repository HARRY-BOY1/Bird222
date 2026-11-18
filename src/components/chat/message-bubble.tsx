"use client";

import type { Message } from "@/types";
import { formatMessageTime } from "@/lib/format";
import { MessageStatusIcon } from "./message-status";
import { cn } from "@/lib/utils";

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
}

export function MessageBubble({ message, isOwn }: MessageBubbleProps) {
  return (
    <div
      className={cn(
        "flex w-full animate-in fade-in slide-in-from-bottom-2 duration-200",
        isOwn ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "relative max-w-[65%] rounded-lg px-3 py-1.5 shadow-sm",
          isOwn
            ? "rounded-tr-none bg-wa-sent"
            : "rounded-tl-none bg-wa-received"
        )}
      >
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
          {message.text}
        </p>
        <div className="mt-0.5 flex items-center justify-end gap-1">
          <span className="text-[11px] text-muted-foreground">
            {formatMessageTime(message.timestamp)}
          </span>
          {isOwn && <MessageStatusIcon status={message.status} />}
        </div>
      </div>
    </div>
  );
}
