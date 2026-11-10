import { FlaskConicalIcon } from "lucide-react";
import { cn } from "cn";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Marks simulated merchant activity. Merchants are simulated in this version. */
export function SimulatedBadge({ className, label = "Demo store" }: { className?: string; label?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn("inline-flex h-5 shrink-0 items-center gap-1 rounded-md border border-dashed px-1.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase", className)}
          tabIndex={0}
        >
          <FlaskConicalIcon className="size-3" aria-hidden />
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-56">A simulated demo store with its own products, stock and pricing rules. Not a real shop yet.</TooltipContent>
    </Tooltip>
  );
}
