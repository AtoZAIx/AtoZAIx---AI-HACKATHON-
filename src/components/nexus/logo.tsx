import { useId } from "react";
import { cn } from "cn";

/** Nexus mark: a buyer node linked to three merchant nodes. */
export function NexusMark({ className }: { className?: string }) {
  // Unique per logo: a gradient defined inside a hidden copy (e.g. the desktop sidebar on a phone) wouldn't paint.
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-8 shrink-0", className)}>
      <defs>
        <linearGradient id={`${id}-tile`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2b2b2b" />
          <stop offset="1" stopColor="#111111" />
        </linearGradient>
        <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f1d9a6" />
          <stop offset="1" stopColor="#b8955a" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${id}-tile)`} />
      <rect x="0.5" y="0.5" width="31" height="31" rx="8.5" fill="none" stroke="#b8955a" strokeOpacity="0.45" />
      <g stroke="#ffffff" strokeOpacity="0.55" strokeWidth="1.6" strokeLinecap="round">
        <path d="M16 18.5 9 10M16 18.5 23 10M16 18.5V25" />
      </g>
      <circle cx="16" cy="18.5" r="3.6" fill={`url(#${id}-gold)`} />
      <circle cx="9" cy="10" r="2.2" fill="#ffffff" />
      <circle cx="23" cy="10" r="2.2" fill="#ffffff" />
      <circle cx="16" cy="25.5" r="2.2" fill="#ffffff" />
    </svg>
  );
}

export function Wordmark({ className, collapsed }: { className?: string; collapsed?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <NexusMark />
      {!collapsed && (
        <span className="leading-tight">
          <span className="block text-[13px] font-semibold tracking-[0.2em]">PAYPAL NEXUS</span>
          <span className="font-display block text-[13px] text-gold-ink italic">Agentic commerce</span>
        </span>
      )}
    </span>
  );
}
