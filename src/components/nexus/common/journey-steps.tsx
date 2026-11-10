import { CheckIcon } from "lucide-react";
import { cn } from "cn";
import { JOURNEY, type JourneyStep } from "@/lib/nexus/journey";

/** "You are here": the five steps of a purchase, with the current one highlighted. */
export function JourneySteps({ current, className }: { current: JourneyStep; className?: string }) {
  const index = JOURNEY.findIndex((s) => s.id === current);
  const done = current === "done";
  return (
    <nav aria-label="Purchase progress" className={cn("surface px-4 py-3", className)}>
      {/* Phone: one clear line */}
      <p className="text-sm sm:hidden">
        <span className="font-semibold">
          Step {index + 1} of {JOURNEY.length}:
        </span>{" "}
        {JOURNEY[index].long}
      </p>
      <div className="mt-2 flex gap-1 sm:hidden" aria-hidden>
        {JOURNEY.map((s, i) => (
          <span key={s.id} className={cn("h-1.5 flex-1 rounded-full", i < index || done ? "bg-success" : i === index ? "bg-brand" : "bg-secondary")} />
        ))}
      </div>
      {/* Larger screens: the full stepper */}
      <ol className="hidden items-center gap-2 sm:flex">
        {JOURNEY.map((s, i) => {
          const complete = i < index || (done && i === index);
          const active = i === index && !done;
          return (
            <li key={s.id} className="flex min-w-0 flex-1 items-center gap-2" aria-current={active ? "step" : undefined}>
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                  complete && "border-success bg-success text-white",
                  active && "border-brand bg-brand text-white",
                  !complete && !active && "text-muted-foreground",
                )}
              >
                {complete ? <CheckIcon className="size-4" /> : i + 1}
              </span>
              <span className={cn("truncate text-sm", active ? "font-semibold" : complete ? "text-foreground" : "text-muted-foreground")}>{s.label}</span>
              {i < JOURNEY.length - 1 && <span className={cn("ml-1 h-px min-w-4 flex-1", i < index ? "bg-success" : "bg-border")} aria-hidden />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
