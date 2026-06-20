import { NextResponse } from "next/server";

/**
 * Supabase auth callback — exchanges code for session via GoTrue REST API.
 * Bypasses @supabase/ssr entirely to avoid cookie handling issues in Route Handlers.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const redirectTo = searchParams.get("next") ?? "/dashboard";

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/login?error=no_code`);
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    // Exchange the auth code for tokens directly via GoTrue
    const tokenRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=pkce`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": anonKey,
      },
      body: JSON.stringify({
        auth_code: code,
        code_verifier: "",  // GoTrue handles this internally from the cookie
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || tokenData.error) {
      const errMsg = tokenData.error_description || tokenData.error || "token exchange failed";
      console.error("[Auth Callback] Token error:", errMsg);
      const detail = encodeURIComponent(String(errMsg).slice(0, 200));
      return NextResponse.redirect(`${origin}/auth/login?error=auth_failed&detail=${detail}`);
    }

    // Build the auth cookie (same format Supabase SSR uses)
    const cookieName = `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
    const cookieValue = encodeURIComponent(JSON.stringify({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in,
      expires_at: tokenData.expires_at,
      token_type: tokenData.token_type,
      user: tokenData.user,
    }));

    const response = NextResponse.redirect(`${origin}${redirectTo}`);
    response.cookies.set(cookieName, cookieValue, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: true, // Vercel is always HTTPS
      maxAge: tokenData.expires_in,
    });

    console.log("[Auth Callback] Session OK, cookie:", cookieName);
    return response;
  } catch (err) {
    console.error("[Auth Callback] Exception:", err);
    const detail = encodeURIComponent((err instanceof Error ? err.message : String(err)).slice(0, 200));
    return NextResponse.redirect(`${origin}/auth/login?error=auth_exception&detail=${detail}`);
  }
}
