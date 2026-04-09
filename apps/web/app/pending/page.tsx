"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { checkUserStatus } from "@/lib/api";

export default function PendingPage() {
  const [status, setStatus] = useState<string>("pending");
  const [email, setEmail] = useState<string>("");

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email || "");
      try {
        const data = await checkUserStatus(user.id);
        setStatus(data.status);
        if (data.status === "approved") {
          window.location.href = "/dashboard";
        }
      } catch {
        // API may not be ready
      }
    }
    load();

    // Poll every 10 seconds in case admin approves
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
          {status === "rejected" ? (
            <>
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
              <p className="text-gray-600 mb-6">
                Your request to join Rubicon has been declined. If you believe this is an error, please contact the platform administrator.
              </p>
            </>
          ) : (
            <>
              <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-amber-500 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Pending Approval</h1>
              <p className="text-gray-600 mb-2">
                Your account <span className="font-medium">{email}</span> is waiting for admin approval.
              </p>
              <p className="text-sm text-gray-500 mb-6">
                Rubicon is a private platform for EMBA Cohort 84. The administrator will review your request shortly. This page will automatically redirect once you're approved.
              </p>
              <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
                <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
                Checking every 10 seconds...
              </div>
            </>
          )}

          <button
            onClick={handleSignOut}
            className="mt-6 text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
