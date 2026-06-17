import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import * as crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

// Meta App config
const APP_SECRET = process.env.META_APP_SECRET || ''
const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'dmify_verify'

// Simple in-memory dedup (use Redis in production)
const processedComments = new Set<string>()
const DEDUP_TTL_MS = 60_000 // 1 minute

// Instagram Graph API. `params` always go in the query string (works for both
// GET and the comment-reply POST). Pass `body` for endpoints such as
// /me/messages that require a JSON request body instead of query params.
function igApi(
  path: string,
  params: Record<string, string>,
  method: 'GET' | 'POST' = 'GET',
  body?: Record<string, unknown>
) {
  const url = new URL(`https://graph.instagram.com/v25.0/${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  const options: RequestInit = { method }
  if (method === 'POST' && body) {
    options.headers = { 'Content-Type': 'application/json' }
    options.body = JSON.stringify(body)
  }
  return fetch(url.toString(), options).then(r => r.json())
}

// Check whether `igUserId` follows the account, using the friendship_status
// field. Falls back to true (treat as follower) on any error or unexpected
// response so a transient Graph API failure never blocks DM delivery.
async function checkIsFollower(igUserId: string, accessToken: string): Promise<boolean> {
  try {
    const res = (await igApi(igUserId, {
      fields: 'friendship_status',
      access_token: accessToken,
    })) as { friendship_status?: { followed_by?: boolean }; error?: unknown }

    if (res.error || !res.friendship_status) {
      console.log('[webhook] follower check failed, defaulting to true:', JSON.stringify(res))
      return true
    }
    return res.friendship_status.followed_by === true
  } catch (err) {
    console.log('[webhook] follower check threw, defaulting to true:', err)
    return true
  }
}

// Verify webhook signature
function verifySignature(payload: string, signature: string): boolean {
  if (!APP_SECRET) return true // dev mode
  const expected = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(payload).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
}

// GET: Webhook verification (Meta requirement)
export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('hub.mode')
  const token = request.nextUrl.searchParams.get('hub.verify_token')
  const challenge = request.nextUrl.searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return new Response(challenge || '', { status: 200 })
  }

  return NextResponse.json({ error: 'Verification failed' }, { status: 403 })
}

// POST: Handle incoming webhook
export async function POST(request: NextRequest) {
  const signature = request.headers.get('x-hub-signature-256') || ''
  const body = await request.text()

  if (!verifySignature(body, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const data = JSON.parse(body) as {
    object: string
    entry?: Array<{ changes: Array<{ field: string; value: WebhookCommentValue }> }>
  }
  console.log('[webhook] received:', JSON.stringify(data, null, 2))

  if (data.object !== 'instagram') {
    return NextResponse.json({ ok: true })
  }

  const supabase = await createClient()

  for (const entry of data.entry || []) {
    for (const change of entry.changes) {
      if (change.field === 'comments') {
        await handleComment(supabase, change.value)
      }
    }
  }

  return NextResponse.json({ ok: true })
}

interface WebhookCommentValue {
  id: string
  media_id: string
  from?: { id: string; username: string }
  text: string
}

interface AccountRow {
  id: string
  access_token: string
  ig_username: string
  reply_comment_text: string
  public_reply_enabled: boolean
  follow_check_enabled: boolean
  private_reply_text: string
  not_following_text: string | null
}

interface PostKeywordRow {
  id: string
  keyword: string
  dm_message: string | null
  dm_link_url: string | null
  not_following_dm: string | null
  not_following_link: string | null
  sort_order: number
}

interface PostRow {
  id: string
  account_id: string
  media_id: string
  dm_message: string | null
  dm_link_url: string | null
  public_reply_text: string | null
  not_following_dm: string | null
  not_following_link: string | null
  accounts: AccountRow
}

/**
 * Build the final DM message with priority:
 *   keyword match > post-level setting > account-level fallback
 */
function buildDmMessage(
  account: AccountRow,
  post: PostRow,
  matchedKeyword: PostKeywordRow | undefined,
  isFollower: boolean
): string {
  let dmMessage: string
  let linkUrl: string

  if (isFollower) {
    dmMessage =
      matchedKeyword?.dm_message ||
      post.dm_message ||
      account.private_reply_text ||
      ''
    linkUrl =
      matchedKeyword?.dm_link_url ||
      post.dm_link_url ||
      ''
  } else {
    dmMessage =
      matchedKeyword?.not_following_dm ||
      post.not_following_dm ||
      account.not_following_text ||
      matchedKeyword?.dm_message ||
      post.dm_message ||
      account.private_reply_text ||
      ''
    linkUrl =
      matchedKeyword?.not_following_link ||
      post.not_following_link ||
      matchedKeyword?.dm_link_url ||
      post.dm_link_url ||
      ''
  }

  if (linkUrl && dmMessage) {
    dmMessage = dmMessage + '\n\n🔗 ' + linkUrl
  }

  return dmMessage
}

/**
 * Build the public reply text with priority:
 *   post-level override > account-level setting
 */
function buildPublicReply(
  account: AccountRow,
  post: PostRow
): string | null {
  return post.public_reply_text || account.reply_comment_text || null
}

async function handleComment(supabase: SupabaseClient, value: WebhookCommentValue) {
  const { id: commentId, media_id: mediaId, from, text: commentText } = value
  const igUserId = from?.id || ''
  const username = from?.username || ''

  if (!commentId || !mediaId) return

  // Dedup check
  if (processedComments.has(commentId)) return
  processedComments.add(commentId)
  setTimeout(() => processedComments.delete(commentId), DEDUP_TTL_MS)

  // Find post by media_id with account join and post-level settings
  const { data: post } = await supabase
    .from('posts')
    .select(
      `id, account_id, media_id, dm_message, dm_link_url, public_reply_text, not_following_dm, not_following_link, ` +
      `accounts!inner(id, access_token, ig_username, reply_comment_text, public_reply_enabled, follow_check_enabled, private_reply_text, not_following_text)`
    )
    .eq('media_id', mediaId)
    .eq('is_active', true)
    .single()

  if (!post) {
    console.log(`[webhook] No active account found for media ${mediaId}`)
    return
  }

  const typedPost = post as unknown as PostRow
  const account = typedPost.accounts

  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .eq('comment_id', commentId)
    .single()

  if (existing) return // Already processed

  // Record conversation
  await supabase.from('conversations').insert({
    account_id: account.id,
    post_id: typedPost.id,
    comment_id: commentId,
    user_igsid: igUserId,
    username,
    comment_text: commentText,
    media_id: mediaId,
    status: 'received',
  })

  // Check for keyword matches (highest priority)
  const { data: keywords } = await supabase
    .from('post_keywords')
    .select('*')
    .eq('post_id', typedPost.id)
    .order('sort_order', { ascending: true })

  const matchedKeyword = (keywords as PostKeywordRow[] | null)?.find(kw =>
    commentText.toLowerCase().includes(kw.keyword.toLowerCase())
  )

  // Follow check via Instagram Graph API (defaults to true on error).
  // Only run it when follow-gating is on; it's only used for DM routing.
  let isFollower = true
  if (account.follow_check_enabled) {
    isFollower = await checkIsFollower(igUserId, account.access_token)
  }

  // Step 1: Public reply to comment
  const publicReplyText = buildPublicReply(account, typedPost)
  if (account.public_reply_enabled && publicReplyText) {
    await igApi(`${mediaId}/comments`, {
      access_token: account.access_token,
      message: `@${username} ${publicReplyText}`,
    }, 'POST')

    await supabase.from('conversations')
      .update({ status: 'replied', replied_at: new Date().toISOString() })
      .eq('comment_id', commentId)
  }

  // Step 2: Private DM reply
  if (account.follow_check_enabled) {
    const dmMessage = buildDmMessage(account, typedPost, matchedKeyword, isFollower)

    if (dmMessage) {
      await igApi(
        'me/messages',
        { access_token: account.access_token },
        'POST',
        {
          recipient: { id: igUserId },
          message: { text: dmMessage },
        }
      )
    }

    await supabase.from('conversations')
      .update({ status: 'confirmed' })
      .eq('comment_id', commentId)
  }

  console.log(`[webhook] Processed comment ${commentId} from @${username}` +
    (matchedKeyword ? ` [keyword: "${matchedKeyword.keyword}"]` : '') +
    ` [follower: ${isFollower}]`)
}
