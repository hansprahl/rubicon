"use client";

import Link from "next/link";
import { Users, Clock } from "lucide-react";
import type { WorkspaceWithMembers } from "@/lib/api";

interface WorkspaceCardProps {
  workspace: WorkspaceWithMembers;
}

function roleBadge(role: string | null) {
  if (!role) return null;
  const colors: Record<string, string> = {
    owner: "bg-purple-100 text-purple-800",
    admin: "bg-blue-100 text-blue-800",
    member: "bg-gray-100 text-gray-800",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[role] || colors.member}`}
    >
      {role}
    </span>
  );
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function WorkspaceCard({ workspace }: WorkspaceCardProps) {
  return (
    <Link
      href={`/workspaces/${workspace.id}`}
      className="block rounded-lg border bg-card p-5 transition-colors hover:bg-accent"
    >
      <div className="flex items-start justify-between">
        <h3 className="truncate font-semibold">{workspace.name}</h3>
        {roleBadge(workspace.role)}
      </div>
      {workspace.description && (
        <p className="mt-1.5 text-sm text-muted-foreground line-clamp-2">
          {workspace.description}
        </p>
      )}
      <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          {workspace.member_count} member{workspace.member_count !== 1 ? "s" : ""}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {timeAgo(workspace.updated_at)}
        </span>
      </div>
    </Link>
  );
}
