"use client";

import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useChat } from "@/context/chat-context";
import { Button } from "@/components/ui/button";

export function SearchBar() {
  const { searchQuery, setSearchQuery } = useChat();

  return (
    <div className="relative px-3 pb-2">
      <Search className="absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder="Search or start new chat"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="h-9 rounded-lg border-none bg-wa-header pl-10 pr-10 text-sm placeholder:text-muted-foreground focus-visible:ring-0"
      />
      {searchQuery && (
        <Button
          variant="icon"
          size="icon"
          className="absolute right-4 top-1/2 h-6 w-6 -translate-y-1/2"
          onClick={() => setSearchQuery("")}
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      )}
    </div>
  );
}
