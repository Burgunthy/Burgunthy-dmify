import { NextResponse } from "next/server";

/**
 * API route auth callback — exchanges code for session via GoTrue REST API.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/login?error=no_code`);
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const tokenRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=pkce`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": anonKey,
      },
      body: JSON.stringify({
        auth_code: code,
        code_verifier: "",
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || tokenData.error) {
      const errMsg = tokenData.error_description || tokenData.error || "token exchange failed";
      console.error("[API Auth Callback] Token error:", errMsg);
      const detail = encodeURIComponent(String(errMsg).slice(0, 200));
      return NextResponse.redirect(`${origin}/auth/login?error=api_auth_failed&detail=${detail}`);
    }

    const cookieName = `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
    const cookieValue = encodeURIComponent(JSON.stringify({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in,
      expires_at: tokenData.expires_at,
      token_type: tokenData.token_type,
      user: tokenData.user,
    }));

    const response = NextResponse.redirect(`${origin}${next}`);
    response.cookies.set(cookieName, cookieValue, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      maxAge: tokenData.expires_in,
    });

    return response;
  } catch (err) {
    console.error("[API Auth Callback] Exception:", err);
    const detail = encodeURIComponent((err instanceof Error ? err.message : String(err)).slice(0, 200));
    return NextResponse.redirect(`${origin}/auth/login?error=api_auth_exception&detail=${detail}`);
  }
}
