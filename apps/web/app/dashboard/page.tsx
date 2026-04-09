"use client";

import { NavSidebar } from "@/components/nav-sidebar";

export default function DashboardPage() {
  return (
    <div className="flex h-screen">
      <NavSidebar />
      <main className="flex-1 overflow-auto">
        <header className="flex h-14 items-center border-b px-6">
          <h1 className="text-lg font-semibold">Dashboard</h1>
        </header>
        <div className="p-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-lg border bg-card p-6">
              <h3 className="text-sm font-medium text-muted-foreground">
                Agent Status
              </h3>
              <p className="mt-2 text-2xl font-bold">Idle</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Your digital twin is ready
              </p>
            </div>
            <div className="rounded-lg border bg-card p-6">
              <h3 className="text-sm font-medium text-muted-foreground">
                Pending Approvals
              </h3>
              <p className="mt-2 text-2xl font-bold">0</p>
              <p className="mt-1 text-xs text-muted-foreground">
                No actions awaiting review
              </p>
            </div>
            <div className="rounded-lg border bg-card p-6">
              <h3 className="text-sm font-medium text-muted-foreground">
                Workspaces
              </h3>
              <p className="mt-2 text-2xl font-bold">0</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Join or create a workspace
              </p>
            </div>
          </div>
          <div className="mt-8">
            <h2 className="text-sm font-medium text-muted-foreground">
              Recent Activity
            </h2>
            <div className="mt-3 rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
              No recent activity. Your agent will show updates here once
              configured.
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
