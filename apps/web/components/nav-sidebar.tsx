"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MessageSquare,
  FolderOpen,
  CheckCircle,
  GitFork,
  User,
  LogOut,
} from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { getApprovalCount } from "@/lib/api";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/workspaces", label: "Workspaces", icon: FolderOpen },
  { href: "/approvals", label: "Approvals", icon: CheckCircle },
  { href: "/graph", label: "Knowledge Graph", icon: GitFork },
  { href: "/profile", label: "Profile", icon: User },
];

export function NavSidebar() {
  const pathname = usePathname();
  const [pendingCount, setPendingCount] = useState(0);

  const refreshCount = useCallback(async (uid: string) => {
    try {
      const { count } = await getApprovalCount(uid);
      setPendingCount(count);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      refreshCount(user.id);

      // Subscribe to realtime changes on the approvals table for this user
      channel = supabase
        .channel("nav-approval-count")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "approvals",
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            refreshCount(user.id);
          }
        )
        .subscribe();
    }

    init();

    return () => {
      if (channel) {
        const supabase = createBrowserSupabaseClient();
        supabase.removeChannel(channel);
      }
    };
  }, [refreshCount]);

  async function handleSignOut() {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <aside className="flex h-screen w-60 flex-col border-r bg-card">
      <div className="flex h-14 items-center border-b px-4">
        <Link href="/dashboard" className="text-lg font-bold">
          Rubicon
        </Link>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          const showBadge =
            item.href === "/approvals" && pendingCount > 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
              {showBadge && (
                <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-medium text-white">
                  {pendingCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-3">
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
