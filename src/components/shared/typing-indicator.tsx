"use client";

import { cn } from "@/lib/utils";

interface TypingIndicatorProps {
  className?: string;
  inline?: boolean;
}

export function TypingIndicator({ className, inline = false }: TypingIndicatorProps) {
  if (inline) {
    return (
      <div className={cn("flex items-center gap-1 px-1", className)}>
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground typing-dot" />
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground typing-dot" />
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground typing-dot" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-lg bg-wa-received px-4 py-3 shadow-sm",
        className
      )}
    >
      <span className="h-2 w-2 rounded-full bg-muted-foreground typing-dot" />
      <span className="h-2 w-2 rounded-full bg-muted-foreground typing-dot" />
      <span className="h-2 w-2 rounded-full bg-muted-foreground typing-dot" />
    </div>
  );
}
