import { cn } from "cn";
import { Skeleton } from "@/components/ui/skeleton";

/** Skeletons for real loading states only. */
export function LoadingState({ variant = "list", rows = 4, className }: { variant?: "list" | "cards" | "panel" | "room"; rows?: number; className?: string }) {
  if (variant === "cards") {
    return (
      <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3", className)} aria-busy aria-label="Loading">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-44 rounded-2xl" />
        ))}
      </div>
    );
  }
  if (variant === "room") {
    return (
      <div className={cn("grid grid-cols-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)_360px]", className)} aria-busy aria-label="Loading">
        <Skeleton className="h-[60vh] rounded-2xl" />
        <Skeleton className="h-[60vh] rounded-2xl" />
        <Skeleton className="h-[60vh] rounded-2xl" />
      </div>
    );
  }
  if (variant === "panel") return <Skeleton className={cn("h-72 rounded-2xl", className)} aria-busy aria-label="Loading" />;
  return (
    <div className={cn("surface divide-y overflow-hidden", className)} aria-busy aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-4">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}
