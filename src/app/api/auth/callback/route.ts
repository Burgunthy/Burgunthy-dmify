import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Supabase auth callback handler (API route convention).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const cookieHeader = request.headers.get("cookie") || "";
    const cookieMap: Record<string, string> = {};
    cookieHeader.split(";").forEach((c) => {
      const [name, ...rest] = c.trim().split("=");
      if (name) cookieMap[name] = rest.join("=");
    });

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
              cookieMap[name] = value;
              newCookies.push({ name, value, options });
            });
          },
        },
      }
    );

    try {
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (!error) {
        const response = NextResponse.redirect(`${origin}${next}`);
        newCookies.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, {
            path: "/",
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            ...options,
          });
        });
        return response;
      }

      console.error("[API Auth Callback] Error:", error.message);
      const detail = encodeURIComponent((error.message || "unknown").slice(0, 200));
      return NextResponse.redirect(`${origin}/auth/login?error=api_auth_failed&detail=${detail}`);
    } catch (err) {
      console.error("[API Auth Callback] Exception:", err);
      const detail = encodeURIComponent((err instanceof Error ? err.message : String(err)).slice(0, 200));
      return NextResponse.redirect(`${origin}/auth/login?error=api_auth_exception&detail=${detail}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=no_code`);
}
