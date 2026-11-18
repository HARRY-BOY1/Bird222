"use client";

import Image from "next/image";

export function EmptyState() {
  return (
    <div className="flex h-full w-full flex-1 flex-col items-center justify-center bg-wa-header p-8 text-center">
      <div className="mb-6">
        <Image
          src="/whatsapp-logo.svg"
          alt="WhatsApp"
          width={120}
          height={120}
          priority
        />
      </div>
      <h2 className="mb-2 text-2xl font-light text-foreground">
        WhatsApp Web
      </h2>
      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
        Send and receive messages without keeping your phone online.
        <br />
        Use WhatsApp on up to 4 linked devices and 1 phone at the same time.
      </p>
      <div className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-block h-px w-8 bg-border" />
        <span>Select a chat to start messaging</span>
        <span className="inline-block h-px w-8 bg-border" />
      </div>
    </div>
  );
}
