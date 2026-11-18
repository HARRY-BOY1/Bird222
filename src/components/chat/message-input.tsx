"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Smile, Paperclip, Mic, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChat } from "@/context/chat-context";
import { cn } from "@/lib/utils";

export function MessageInput() {
  const { sendMessage, setIsTyping, activeChatId } = useChat();
  const [text, setText] = useState("");
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const clearTypingTimeout = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  }, []);

  const handleTyping = useCallback(() => {
    setIsTyping(true);
    clearTypingTimeout();
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
    }, 2000);
  }, [setIsTyping, clearTypingTimeout]);

  const handleSend = useCallback(() => {
    if (!text.trim()) return;
    sendMessage(text);
    setText("");
    setIsTyping(false);
    clearTypingTimeout();
    inputRef.current?.focus();
  }, [text, sendMessage, setIsTyping, clearTypingTimeout]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  useEffect(() => {
    return () => clearTypingTimeout();
  }, [clearTypingTimeout]);

  useEffect(() => {
    setText("");
    setIsTyping(false);
    clearTypingTimeout();
  }, [activeChatId, setIsTyping, clearTypingTimeout]);

  const hasText = text.trim().length > 0;

  return (
    <footer className="flex items-end gap-2 bg-wa-header px-4 py-3">
      <Button variant="icon" size="icon" aria-label="Emoji" className="shrink-0">
        <Smile className="h-6 w-6 text-muted-foreground" />
      </Button>
      <Button variant="icon" size="icon" aria-label="Attach" className="shrink-0">
        <Paperclip className="h-6 w-6 text-muted-foreground" />
      </Button>

      <div className="flex-1">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            handleTyping();
          }}
          onFocus={handleTyping}
          onBlur={() => {
            clearTypingTimeout();
            setTimeout(() => setIsTyping(false), 500);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Type a message"
          rows={1}
          className={cn(
            "max-h-32 w-full resize-none rounded-lg border-none bg-background px-4 py-2.5 text-sm",
            "placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-wa-accent/50"
          )}
        />
      </div>

      <Button
        variant="icon"
        size="icon"
        onClick={hasText ? handleSend : undefined}
        aria-label={hasText ? "Send message" : "Voice message"}
        className={cn("shrink-0", hasText && "text-wa-accent")}
      >
        {hasText ? (
          <Send className="h-6 w-6" />
        ) : (
          <Mic className="h-6 w-6 text-muted-foreground" />
        )}
      </Button>
    </footer>
  );
}
