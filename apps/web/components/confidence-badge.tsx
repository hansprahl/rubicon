"use client";

import { cn } from "@/lib/utils";

interface ConfidenceBadgeProps {
  score: number;
  reasoning?: string;
  className?: string;
}

function getLevel(score: number) {
  if (score >= 0.7) return { label: "High", color: "bg-green-100 text-green-800" };
  if (score >= 0.4) return { label: "Medium", color: "bg-yellow-100 text-yellow-800" };
  return { label: "Low", color: "bg-red-100 text-red-800" };
}

export function ConfidenceBadge({ score, reasoning, className }: ConfidenceBadgeProps) {
  const { label, color } = getLevel(score);
  const pct = Math.round(score * 100);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        color,
        className
      )}
      title={reasoning || `Confidence: ${pct}%`}
    >
      {pct}% {label}
    </span>
  );
}
