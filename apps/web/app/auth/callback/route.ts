import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (code) {
    const cookieStore = cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          },
        },
      }
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.redirect(new URL("/login?error=auth_failed", request.url));
    }

    // Create template agent on first login
    if (data?.user) {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001/api";
      try {
        await fetch(`${apiBase}/agents/ensure/${data.user.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
      } catch {
        // Non-blocking — dashboard will retry if needed
      }
    }
  }

  return NextResponse.redirect(new URL("/dashboard", request.url));
}
