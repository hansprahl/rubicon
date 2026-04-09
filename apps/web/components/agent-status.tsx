"use client";

import { cn } from "@/lib/utils";

type Status = "idle" | "thinking" | "working" | "waiting_approval";

interface AgentStatusProps {
  status: Status;
  agentName?: string;
  className?: string;
}

const statusConfig: Record<Status, { label: string; dot: string; description: string }> = {
  idle: {
    label: "Idle",
    dot: "bg-gray-400",
    description: "Ready for instructions",
  },
  thinking: {
    label: "Thinking",
    dot: "bg-blue-500 animate-pulse",
    description: "Processing your message...",
  },
  working: {
    label: "Working",
    dot: "bg-amber-500 animate-pulse",
    description: "Executing a task",
  },
  waiting_approval: {
    label: "Awaiting Approval",
    dot: "bg-purple-500",
    description: "Needs your review",
  },
};

export function AgentStatus({ status, agentName, className }: AgentStatusProps) {
  const config = statusConfig[status];

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span className={cn("h-2.5 w-2.5 rounded-full", config.dot)} />
      <div>
        <p className="text-sm font-medium">
          {agentName ? `${agentName} — ` : ""}
          {config.label}
        </p>
        <p className="text-xs text-muted-foreground">{config.description}</p>
      </div>
    </div>
  );
}
