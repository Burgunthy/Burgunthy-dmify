import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/server'

// GET /api/post-keywords?post_id=xxx — list keywords for a post
export async function GET(request: NextRequest) {
  try {
    const postId = request.nextUrl.searchParams.get('post_id')
    if (!postId) {
      return NextResponse.json({ error: 'post_id is required.' }, { status: 400 })
    }

    const supabase = await getServiceClient()

    const { data, error } = await supabase
      .from('post_keywords')
      .select('*')
      .eq('post_id', postId)
      .order('sort_order', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('[post-keywords GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/post-keywords — add a keyword
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      post_id,
      keyword,
      dm_message,
      dm_link_url,
      not_following_dm,
      not_following_link,
    } = body as {
      post_id?: string
      keyword?: string
      dm_message?: string | null
      dm_link_url?: string | null
      not_following_dm?: string | null
      not_following_link?: string | null
    }

    if (!post_id || !keyword) {
      return NextResponse.json(
        { error: 'post_id and keyword are required.' },
        { status: 400 }
      )
    }

    const supabase = await getServiceClient()

    // Get max sort_order for this post
    const { data: existing } = await supabase
      .from('post_keywords')
      .select('sort_order')
      .eq('post_id', post_id)
      .order('sort_order', { ascending: false })
      .limit(1)

    const nextSortOrder = existing && existing.length > 0 ? (existing[0].sort_order ?? 0) + 1 : 0

    const { data, error } = await supabase
      .from('post_keywords')
      .insert({
        post_id,
        keyword,
        dm_message: dm_message || null,
        dm_link_url: dm_link_url || null,
        not_following_dm: not_following_dm || null,
        not_following_link: not_following_link || null,
        sort_order: nextSortOrder,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('[post-keywords POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/post-keywords — update a keyword
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      id,
      keyword,
      dm_message,
      dm_link_url,
      not_following_dm,
      not_following_link,
      sort_order,
    } = body as {
      id?: string
      keyword?: string
      dm_message?: string | null
      dm_link_url?: string | null
      not_following_dm?: string | null
      not_following_link?: string | null
      sort_order?: number
    }

    if (!id) {
      return NextResponse.json({ error: 'id is required.' }, { status: 400 })
    }

    const supabase = await getServiceClient()

    const updateData: Record<string, unknown> = {}
    if (keyword !== undefined) updateData.keyword = keyword
    if (dm_message !== undefined) updateData.dm_message = dm_message || null
    if (dm_link_url !== undefined) updateData.dm_link_url = dm_link_url || null
    if (not_following_dm !== undefined) updateData.not_following_dm = not_following_dm || null
    if (not_following_link !== undefined) updateData.not_following_link = not_following_link || null
    if (sort_order !== undefined) updateData.sort_order = sort_order

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields to update.' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('post_keywords')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('[post-keywords PATCH]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/post-keywords — remove a keyword
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { id } = body as { id?: string }

    if (!id) {
      return NextResponse.json({ error: 'id is required.' }, { status: 400 })
    }

    const supabase = await getServiceClient()

    const { error } = await supabase.from('post_keywords').delete().eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[post-keywords DELETE]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
