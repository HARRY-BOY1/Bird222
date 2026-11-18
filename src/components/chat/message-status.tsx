"use client";

import type { MessageStatus } from "@/types";
import { IoCheckmark, IoCheckmarkDone } from "react-icons/io5";
import { cn } from "@/lib/utils";

interface MessageStatusIconProps {
  status: MessageStatus;
  className?: string;
}

export function MessageStatusIcon({ status, className }: MessageStatusIconProps) {
  if (status === "sent") {
    return (
      <IoCheckmark
        className={cn("h-4 w-4 text-muted-foreground", className)}
      />
    );
  }

  return (
    <IoCheckmarkDone
      className={cn(
        "h-4 w-4",
        status === "read" ? "text-sky-400" : "text-muted-foreground",
        className
      )}
    />
  );
}
