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
  Wrench,
  Package,
  TrendingUp,
  User,
  Star,
  LogOut,
  Menu,
  X,
  MessageSquarePlus,
  Shield,
} from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { getApprovalCount, checkUserStatus } from "@/lib/api";
import { useRealtimeApprovals } from "@/lib/realtime";
import { NotificationBell } from "@/components/notification-bell";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/workspaces", label: "Workspaces", icon: FolderOpen },
  { href: "/approvals", label: "Approvals", icon: CheckCircle },
  { href: "/graph", label: "Knowledge Graph", icon: GitFork },
  { href: "/tools", label: "Tools", icon: Wrench },
  { href: "/agent-repo", label: "Agent Repo", icon: Package },
  { href: "/intelligence", label: "Insights", icon: TrendingUp },
  { href: "/profile", label: "Profile", icon: User },
  { href: "/north-star", label: "North Star", icon: Star },
  { href: "/feedback", label: "Feedback", icon: MessageSquarePlus },
];

export function NavSidebar() {
  const pathname = usePathname();
  const [pendingCount, setPendingCount] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const refreshCount = useCallback(async (uid: string) => {
    try {
      const { count } = await getApprovalCount(uid);
      setPendingCount(count);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    async function init() {
      const supabase = createBrowserSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      refreshCount(user.id);
      try {
        const statusData = await checkUserStatus(user.id);
        setIsAdmin(statusData.is_admin);
      } catch {
        // ignore
      }
    }
    init();
  }, [refreshCount]);

  // Live approval count via Supabase Realtime
  useRealtimeApprovals(userId, () => {
    if (userId) refreshCount(userId);
  });

  // Close mobile nav on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  async function handleSignOut() {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const sidebarContent = (
    <>
      <div className="flex h-14 items-center justify-between border-b px-4">
        <Link href="/dashboard" className="text-lg font-bold">
          Rubicon
        </Link>
        <div className="flex items-center gap-1">
          {userId && <NotificationBell userId={userId} />}
          <button
            onClick={() => setMobileOpen(false)}
            className="rounded-md p-2 text-muted-foreground hover:bg-accent md:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {[...navItems, ...(isAdmin ? [{ href: "/admin/users", label: "Admin", icon: Shield }] : [])].map((item) => {
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
          className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-3 top-3 z-40 rounded-md border bg-card p-2 shadow-sm md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — desktop always visible, mobile slides in */}
      <aside
        className={cn(
          "flex h-screen w-60 shrink-0 flex-col border-r bg-card",
          "max-md:fixed max-md:left-0 max-md:top-0 max-md:z-50 max-md:transition-transform max-md:duration-200",
          mobileOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full"
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
