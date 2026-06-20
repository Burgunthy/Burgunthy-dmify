import { cookies } from "next/headers";

/**
 * Resolve the current Supabase user ID from the auth cookie, WITHOUT calling
 * supabase.auth.getUser()/getSession(). Those trigger a GoTrue GET request that
 * returns 405 "Unsupported request - method type: get" in some environments —
 * the same reason middleware.ts, api/auth/instagram/callback, and
 * api/accounts/connect all decode the JWT directly instead.
 *
 * Safe to call from Server Components and Route Handlers. Returns null when there
 * is no session cookie or the JWT cannot be decoded.
 */
export async function getServerUserId(): Promise<string | null> {
  try {
    const store = await cookies();
    const cookieName = store
      .getAll()
      .find((c) => c.name.includes("-auth-token"))?.name;
    if (!cookieName) return null;

    const value = store.get(cookieName)?.value;
    if (!value) return null;

    const parsed = JSON.parse(decodeURIComponent(value));
    const accessToken: string | undefined = parsed.access_token;
    if (!accessToken) return null;

    const parts = accessToken.split(".");
    if (parts.length !== 3) return null;

    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    return payload.sub ?? null;
  } catch {
    return null;
  }
}
