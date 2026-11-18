"use client";

import { MessageCircle, CircleDot, Users, Phone } from "lucide-react";
import type { SidebarTab } from "@/types";
import { cn } from "@/lib/utils";

const TABS: { id: SidebarTab; label: string; icon: typeof MessageCircle }[] = [
  { id: "chats", label: "Chats", icon: MessageCircle },
  { id: "status", label: "Status", icon: CircleDot },
  { id: "contacts", label: "Contacts", icon: Users },
  { id: "calls", label: "Calls", icon: Phone },
];

interface SidebarNavProps {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
}

export function SidebarNav({ activeTab, onTabChange }: SidebarNavProps) {
  return (
    <nav className="flex shrink-0 border-t border-border bg-wa-header">
      {TABS.map(({ id, label, icon: Icon }) => {
        const isActive = activeTab === id;
        return (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] transition-colors",
              isActive
                ? "text-wa-accent"
                : "text-muted-foreground hover:text-foreground"
            )}
            aria-label={label}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon className={cn("h-5 w-5", isActive && "stroke-[2.5]")} />
            <span className="font-medium">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
