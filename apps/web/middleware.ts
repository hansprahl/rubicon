import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Public pages — no auth required
  if (pathname.startsWith("/login") || pathname.startsWith("/auth") || pathname === "/pending") {
    // If logged in user hits /login, send to dashboard
    if (user && pathname.startsWith("/login")) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return response;
  }

  // Not logged in — redirect to login
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Check approval status via API
  // Admin pages are only for admins (checked server-side too, but redirect here for UX)
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
  try {
    const statusRes = await fetch(`${apiBase}/admin/users/${user.id}/check`, {
      headers: { "Content-Type": "application/json" },
    });
    if (statusRes.ok) {
      const data = await statusRes.json();

      // User not yet in public.users — let them through to trigger ensure_agent
      if (data.status === "not_found") {
        return response;
      }

      // Pending users can only see the /pending page
      if (data.status === "pending" && pathname !== "/pending") {
        return NextResponse.redirect(new URL("/pending", request.url));
      }

      // Rejected users go to /pending too (shows rejection message)
      if (data.status === "rejected" && pathname !== "/pending") {
        return NextResponse.redirect(new URL("/pending", request.url));
      }

      // Approved users on /pending — send to dashboard
      if (data.status === "approved" && pathname === "/pending") {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }

      // Admin pages — only admins
      if (pathname.startsWith("/admin") && !data.is_admin) {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
    }
  } catch {
    // If API is down, let them through (graceful degradation)
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
