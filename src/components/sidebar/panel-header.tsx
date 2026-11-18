"use client";

import { MoreVertical } from "lucide-react";
import { useChat } from "@/context/chat-context";
import { UserAvatar } from "@/components/shared/user-avatar";
import { WhatsAppLogo } from "@/components/shared/whatsapp-logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Button } from "@/components/ui/button";

interface PanelHeaderProps {
  title?: string;
  showLogo?: boolean;
}

export function PanelHeader({ title, showLogo = true }: PanelHeaderProps) {
  const { currentUser } = useChat();

  return (
    <>
      {showLogo && (
        <div className="bg-wa-header px-4 pt-3">
          <WhatsAppLogo size={28} className="mb-3" />
        </div>
      )}
      <header className="flex items-center justify-between bg-wa-header px-4 pb-3">
        <div className="flex items-center gap-3">
          <UserAvatar
            name={currentUser.name}
            size="md"
            showOnline
            isOnline
          />
          {title && (
            <h1 className="text-xl font-medium text-foreground">{title}</h1>
          )}
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button variant="icon" size="icon" aria-label="Menu">
            <MoreVertical className="h-5 w-5 text-muted-foreground" />
          </Button>
        </div>
      </header>
    </>
  );
}
