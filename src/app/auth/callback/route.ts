import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const redirectTo = searchParams.get("next") ?? "/dashboard";

  if (code) {
    // 1. Read incoming cookies from the browser (contains PKCE verifier, etc.)
    const cookieHeader = request.headers.get("cookie") || "";
    const cookieMap: Record<string, string> = {};
    cookieHeader.split(";").forEach((c) => {
      const [name, ...rest] = c.trim().split("=");
      if (name) cookieMap[name] = rest.join("=");
    });

    // 2. Capture cookies Supabase wants to set on the response
    const newCookies: { name: string; value: string; options?: Record<string, unknown> }[] = [];

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return Object.entries(cookieMap).map(([name, value]) => ({ name, value }));
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieMap[name] = value; // update map for subsequent reads within this request
              newCookies.push({ name, value, options });
            });
          },
        },
      }
    );

    try {
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (!error) {
        const response = NextResponse.redirect(`${origin}${redirectTo}`);
        // Set all session cookies on the response
        newCookies.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, {
            path: "/",
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            ...options,
          });
        });
        console.log("[Auth Callback] Session created, cookies:", newCookies.map((c) => c.name));
        return response;
      }

      console.error("[Auth Callback] Error:", error.message);
      const detail = encodeURIComponent((error.message || "unknown").slice(0, 200));
      return NextResponse.redirect(`${origin}/auth/login?error=auth_failed&detail=${detail}`);
    } catch (err) {
      console.error("[Auth Callback] Exception:", err);
      const detail = encodeURIComponent((err instanceof Error ? err.message : String(err)).slice(0, 200));
      return NextResponse.redirect(`${origin}/auth/login?error=auth_exception&detail=${detail}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=no_code`);
}
