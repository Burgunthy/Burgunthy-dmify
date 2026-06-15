import { NextRequest, NextResponse } from 'next/server'

function getEnv(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing env: ${key}`)
  return val
}

// GET /api/auth/instagram — redirect to Facebook Login with Instagram permissions
export async function GET(request: NextRequest) {
  const APP_ID = getEnv('META_APP_ID')
  const APP_URL = getEnv('NEXT_PUBLIC_APP_URL')
  const REDIRECT_URI = `${APP_URL}/api/auth/instagram/callback`

  const SCOPES = [
    'instagram_business_basic',
    'instagram_business_manage_messages',
    'instagram_business_manage_comments',
    'instagram_business_content_publish',
    'instagram_business_manage_insights',
  ].join(',')

  const state = crypto.randomUUID()

  // Facebook Login dialog with Instagram permissions
  const params = new URLSearchParams({
    client_id: APP_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    state,
  })

  const loginUrl = `https://www.facebook.com/v25.0/dialog/oauth?${params.toString()}`

  const response = NextResponse.redirect(loginUrl)
  response.cookies.set('ig_oauth_state', state, {
    path: '/',
    maxAge: 600,
    httpOnly: true,
    secure: true,
  })

  return response
}
