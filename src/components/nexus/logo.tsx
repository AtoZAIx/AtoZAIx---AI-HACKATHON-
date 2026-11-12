import { cn } from "cn";

/** Compact AtoZAIx monogram, for the collapsed sidebar. */
export function AtoZMark({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl bg-foreground pt-1 text-background shadow-card", className)}>
      <span className="font-script text-[34px] leading-none">Az</span>
    </span>
  );
}

/**
 * The AtoZAIx wordmark in an Italian cursive script, with PAYPAL spaced
 * underneath (the hackathon this was built for, and the payments it uses).
 */
export function Wordmark({ className, collapsed, compact }: { className?: string; collapsed?: boolean; compact?: boolean }) {
  if (collapsed) return <AtoZMark className={className} />;
  return (
    <span className={cn("inline-flex flex-col leading-none", className)}>
      <span className={cn("font-script whitespace-nowrap text-foreground", compact ? "text-[36px]" : "text-[44px]")} style={{ lineHeight: 0.8 }}>
        AtoZAIx
      </span>
      <span className={cn("pl-1 font-medium tracking-[0.42em] text-muted-foreground", compact ? "mt-0.5 text-[8px]" : "mt-1 text-[9px]")}>PAYPAL</span>
    </span>
  );
}
