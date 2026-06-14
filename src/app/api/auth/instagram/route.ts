import { NextRequest, NextResponse } from 'next/server'

function getEnv(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing env: ${key}`)
  return val
}

// GET /api/auth/instagram — redirect to Meta OAuth
export async function GET(request: NextRequest) {
  const APP_ID = getEnv('META_APP_ID')
  const APP_URL = getEnv('NEXT_PUBLIC_APP_URL')
  const REDIRECT_URI = `${APP_URL}/api/auth/instagram/callback`

  const SCOPES = [
    'instagram_basic',
    'instagram_manage_comments',
    'instagram_manage_messages',
    'instagram_content_publish',
  ].join(',')

  const state = crypto.randomUUID()

  const oauthUrl = new URL('https://www.facebook.com/v25.0/dialog/oauth')
  oauthUrl.searchParams.set('client_id', APP_ID)
  oauthUrl.searchParams.set('redirect_uri', REDIRECT_URI)
  oauthUrl.searchParams.set('scope', SCOPES)
  oauthUrl.searchParams.set('response_type', 'code')
  oauthUrl.searchParams.set('state', state)

  const response = NextResponse.redirect(oauthUrl.toString())
  response.cookies.set('ig_oauth_state', state, {
    path: '/',
    maxAge: 600,
    httpOnly: true,
    secure: true,
  })

  return response
}
