"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getInitials } from "@/lib/format";
import { getAvatarColor } from "@/lib/avatar-colors";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  name: string;
  size?: "sm" | "md" | "lg";
  showOnline?: boolean;
  isOnline?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
};

export function UserAvatar({
  name,
  size = "md",
  showOnline = false,
  isOnline = false,
  className,
}: UserAvatarProps) {
  return (
    <div className={cn("relative shrink-0", className)}>
      <Avatar className={sizeClasses[size]}>
        <AvatarFallback
          className={cn(
            getAvatarColor(name),
            "font-semibold text-white"
          )}
        >
          {getInitials(name)}
        </AvatarFallback>
      </Avatar>
      {showOnline && (
        <span
          className={cn(
            "absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-wa-sidebar",
            isOnline ? "bg-green-500" : "bg-gray-400"
          )}
        />
      )}
    </div>
  );
}
