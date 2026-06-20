import { NextRequest, NextResponse } from "next/server"
import { getServiceClient } from "@/lib/supabase/server"
import { expiryFromTtl } from "@/lib/instagram"

function getEnv(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing env: ${key}`)
  return val
}

/**
 * Extract user ID from Supabase JWT stored in httpOnly cookie.
 * Avoids calling supabase.auth.getSession() which triggers a GoTrue GET request
 * that returns 405 "Unsupported request - method type: get" in some environments.
 */
function getUserIdFromCookie(request: NextRequest): string | null {
  try {
    // Supabase stores auth data in a cookie named sb-<ref>-auth-token
    const cookieName = request.cookies.getAll().find(
      (c) => c.name.includes("-auth-token")
    )?.name
    if (!cookieName) return null

    const cookieValue = request.cookies.get(cookieName)?.value
    if (!cookieValue) return null

    const parsed = JSON.parse(decodeURIComponent(cookieValue))
    const accessToken: string | undefined = parsed.access_token
    if (!accessToken) return null

    // Decode JWT payload (base64url)
    const parts = accessToken.split(".")
    if (parts.length !== 3) return null

    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString())
    return payload.sub || null
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const errorParam = searchParams.get("error")
    const errorReason = searchParams.get("error_reason")
    const errorDescription = searchParams.get("error_description")

    const CLIENT_ID = getEnv("INSTAGRAM_CLIENT_ID")
    const APP_SECRET = getEnv("INSTAGRAM_APP_SECRET")
    const APP_URL = getEnv("NEXT_PUBLIC_APP_URL")
    const REDIRECT_URI = `${APP_URL}/api/auth/instagram/callback`

    // Check CSRF state
    const savedState = request.cookies.get("ig_oauth_state")?.value
    if (!state || !savedState || state !== savedState) {
      console.error("[ig callback] CSRF check failed")
      const detail = encodeURIComponent(
        `state=${state ?? "null"}, saved=${savedState ?? "null"}`
      )
      return NextResponse.redirect(
        new URL(`/dashboard/accounts?error=invalid_state&detail=${detail}`, request.url)
      )
    }

    if (errorParam) {
      console.error("[ig callback] OAuth error:", errorParam, errorReason)
      const detail = encodeURIComponent(`${errorReason}: ${errorDescription || "unknown"}`)
      return NextResponse.redirect(
        new URL(`/dashboard/accounts?error=oauth_denied&detail=${detail}`, request.url)
      )
    }

    if (!code) {
      return NextResponse.redirect(new URL("/dashboard/accounts?error=no_code", request.url))
    }

    // --- Step 1: Exchange code for short-lived access token ---
    const tokenResp = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: APP_SECRET,
        grant_type: "authorization_code",
        redirect_uri: REDIRECT_URI,
        code,
      }),
    })
    const tokenData = await tokenResp.json()
    const tokenResult = Array.isArray(tokenData.data) ? tokenData.data[0] : tokenData

    if (!tokenResp.ok || !tokenResult?.access_token) {
      console.error("[ig callback] Token exchange failed:", JSON.stringify(tokenData))
      const detail = encodeURIComponent(
        tokenData.error?.message || tokenData.error_type || JSON.stringify(tokenData)
      )
      return NextResponse.redirect(
        new URL(`/dashboard/accounts?error=token_failed&detail=${detail}`, request.url)
      )
    }

    const shortToken = tokenResult.access_token
    const igUserId = tokenResult.user_id

    if (!igUserId) {
      return NextResponse.redirect(
        new URL(`/dashboard/accounts?error=token_failed&detail=no_user_id`, request.url)
      )
    }

    // --- Step 2: Exchange for long-lived token ---
    const longResp = await fetch(
      `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${APP_SECRET}&access_token=${shortToken}`
    )
    const longData = await longResp.json()

    if (!longResp.ok || !longData.access_token) {
      console.error("[ig callback] Long-lived token failed:", JSON.stringify(longData))
      const detail = encodeURIComponent(longData.error?.message || JSON.stringify(longData))
      return NextResponse.redirect(
        new URL(`/dashboard/accounts?error=token_upgrade_failed&detail=${detail}`, request.url)
      )
    }

    const longToken = longData.access_token
    const tokenExpiresAt = expiryFromTtl(longData.expires_in)

    // --- Step 3: Get Instagram user details ---
    const igDetailResp = await fetch(
      `https://graph.instagram.com/me?fields=id,username,name,profile_picture_url,account_type&access_token=${longToken}`
    )
    const igDetail = await igDetailResp.json()

    if (igDetail.error) {
      console.error("[ig callback] IG detail failed:", JSON.stringify(igDetail.error))
      const detail = encodeURIComponent(JSON.stringify(igDetail.error))
      return NextResponse.redirect(
        new URL(`/dashboard/accounts?error=no_ig_account&detail=${detail}`, request.url)
      )
    }

    console.log("[ig callback] IG detail:", igDetail.username, igDetail.id, igDetail.account_type)

    // --- Step 4: Get user ID from JWT cookie (no GoTrue call) ---
    const userId = getUserIdFromCookie(request)
    if (!userId) {
      console.error("[ig callback] No user ID in Supabase auth cookie")
      return NextResponse.redirect(new URL("/auth/login", request.url))
    }

    // --- Step 5: Save to database using service role client (bypasses RLS) ---
    const supabase = await getServiceClient()
    const { error: dbError } = await supabase.from("accounts").upsert(
      {
        user_id: userId,
        ig_id: String(igUserId),
        ig_username: igDetail.username || "",
        access_token: longToken,
        ...(tokenExpiresAt ? { token_expires_at: tokenExpiresAt } : {}),
      },
      { onConflict: "ig_id" }
    )

    if (dbError) {
      console.error("[ig callback] DB upsert error:", dbError.message, dbError.details)
      const detail = encodeURIComponent(
        `${dbError.message} | ${dbError.details || "none"} | code: ${dbError.code || "none"}`
      )
      return NextResponse.redirect(
        new URL(`/dashboard/accounts?error=db_error&detail=${detail}`, request.url)
      )
    }

    console.log("[ig callback] Account saved:", igDetail.username, "for user:", userId)
    return NextResponse.redirect(new URL("/dashboard/accounts?success=connected", request.url))
  } catch (err) {
    console.error("[ig callback] Unexpected error:", err)
    const message = err instanceof Error ? err.message : String(err)
    const detail = encodeURIComponent(message.slice(0, 300))
    return NextResponse.redirect(
      new URL(`/dashboard/accounts?error=unknown&detail=${detail}`, request.url)
    )
  }
}
