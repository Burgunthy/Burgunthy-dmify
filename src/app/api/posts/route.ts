import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/server'

// GET /api/posts — list posts with account info
export async function GET(request: NextRequest) {
  try {
    const supabase = await getServiceClient()

    // Optional filters via query params
    const { searchParams } = request.nextUrl
    const accountId = searchParams.get('account_id')
    const isActive = searchParams.get('is_active')

    let query = supabase
      .from('posts')
      .select(`
        *,
        accounts (
          id,
          ig_username,
          is_active
        ),
        products (
          id,
          name,
          link_url
        )
      `)
      .order('created_at', { ascending: false })

    if (accountId) {
      query = query.eq('account_id', accountId)
    }
    if (isActive !== null) {
      query = query.eq('is_active', isActive === 'true')
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('[posts GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/posts — register a new post for monitoring
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { account_id, media_id, media_type, caption, media_url } = body as {
      account_id?: string
      media_id?: string
      media_type?: string
      caption?: string | null
      media_url?: string | null
    }

    if (!account_id || !media_id) {
      return NextResponse.json(
        { error: 'account_id and media_id are required.' },
        { status: 400 }
      )
    }

    const supabase = await getServiceClient()

    // Upsert: insert new post or update if already exists
    const { data, error } = await supabase
      .from('posts')
      .upsert(
        {
          account_id,
          media_id,
          media_type: media_type || null,
          caption: caption || null,
          media_url: media_url || null,
          is_active: true,
        },
        { onConflict: 'account_id,media_id' }
      )
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('[posts POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/posts — toggle is_active
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, is_active } = body as { id?: string; is_active?: boolean }

    if (!id || typeof is_active !== 'boolean') {
      return NextResponse.json(
        { error: 'id and is_active are required.' },
        { status: 400 }
      )
    }

    const supabase = await getServiceClient()

    const { data, error } = await supabase
      .from('posts')
      .update({ is_active })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('[posts PATCH]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/posts — remove a post
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { id } = body as { id?: string }

    if (!id) {
      return NextResponse.json({ error: 'id is required.' }, { status: 400 })
    }

    const supabase = await getServiceClient()

    const { error } = await supabase.from('posts').delete().eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[posts DELETE]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
