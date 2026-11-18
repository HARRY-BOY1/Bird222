import type { ChatThemeId } from "@/types";

export const CHAT_THEME_CLASSES: Record<ChatThemeId, string> = {
  default: "chat-theme-default",
  ocean: "chat-theme-ocean",
  forest: "chat-theme-forest",
  sunset: "chat-theme-sunset",
  lavender: "chat-theme-lavender",
};

export function getChatThemeClass(theme?: ChatThemeId): string {
  return CHAT_THEME_CLASSES[theme ?? "default"];
}
