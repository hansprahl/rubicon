"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function LoadingSpinner({
  message,
  className,
}: {
  message?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center py-12 text-sm text-muted-foreground",
        className
      )}
    >
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      {message || "Loading..."}
    </div>
  );
}
