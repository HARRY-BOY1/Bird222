import Image from "next/image";
import { cn } from "@/lib/utils";

interface WhatsAppLogoProps {
  size?: number;
  showText?: boolean;
  className?: string;
}

export function WhatsAppLogo({
  size = 32,
  showText = true,
  className,
}: WhatsAppLogoProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Image
        src="/whatsapp-logo.svg"
        alt="WhatsApp"
        width={size}
        height={size}
        priority
      />
      {showText && (
        <span className="text-lg font-semibold tracking-tight text-foreground">
          WhatsApp
        </span>
      )}
    </div>
  );
}
