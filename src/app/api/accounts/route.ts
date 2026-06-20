import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/server'
import { canAddAccount } from '@/lib/plan-guard'

/**
 * Extract user ID from Supabase JWT stored in the httpOnly cookie (same approach
 * as middleware.ts and the Instagram connect/callback routes — avoids a GoTrue
 * GET that returns 405 in some environments).
 */
function getUserIdFromCookie(request: NextRequest): string | null {
  try {
    const cookieName = request.cookies
      .getAll()
      .find((c) => c.name.includes('-auth-token'))?.name
    if (!cookieName) return null

    const cookieValue = request.cookies.get(cookieName)?.value
    if (!cookieValue) return null

    const parsed = JSON.parse(decodeURIComponent(cookieValue))
    const accessToken: string | undefined = parsed.access_token
    if (!accessToken) return null

    const parts = accessToken.split('.')
    if (parts.length !== 3) return null

    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
    return payload.sub || null
  } catch {
    return null
  }
}

// GET /api/accounts — list all accounts for the authenticated user
export async function GET() {
  try {
    const supabase = await getServiceClient()

    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('[accounts GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/accounts — create a new Instagram account
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      ig_username,
      ig_user_id,
      access_token,
      reply_comment_text,
      public_reply_enabled = true,
      follow_check_enabled = true,
      private_reply_text,
    } = body as {
      ig_username?: string
      ig_user_id?: string
      access_token?: string
      reply_comment_text?: string
      public_reply_enabled?: boolean
      follow_check_enabled?: boolean
      private_reply_text?: string
    }

    // Validate required fields
    if (!ig_username || !ig_user_id || !access_token) {
      return NextResponse.json(
        { error: 'ig_username, ig_user_id, and access_token fields are required.' },
        { status: 400 }
      )
    }

    const userId = getUserIdFromCookie(request)
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const supabase = await getServiceClient()

    // Enforce plan account limit before creating a new account.
    const { allowed } = await canAddAccount(supabase, userId)
    if (!allowed) {
      return NextResponse.json(
        { error: '계정 연결 한도에 도달했습니다. 요금제를 업그레이드해주세요.' },
        { status: 403 }
      )
    }

    const { data, error } = await supabase
      .from('accounts')
      .insert({
        ig_username,
        ig_user_id,
        access_token,
        reply_comment_text: reply_comment_text || null,
        public_reply_enabled,
        follow_check_enabled,
        private_reply_text: private_reply_text || null,
        is_active: true,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('[accounts POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
