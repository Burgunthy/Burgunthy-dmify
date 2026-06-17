-- =====================================================
-- 게시물별 자동화 설정 (Inpock 방식)
-- DMify 마이그레이션
-- =====================================================

-- 1. posts 테이블에 게시물별 설정 컬럼 추가
ALTER TABLE posts ADD COLUMN IF NOT EXISTS dm_message TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS dm_link_url TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS public_reply_text TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS not_following_dm TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS not_following_link TEXT;

-- 2. post_keywords 테이블 생성 (키워드별 다른 DM/링크)
CREATE TABLE IF NOT EXISTS post_keywords (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  dm_message TEXT,
  dm_link_url TEXT,
  not_following_dm TEXT,
  not_following_link TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_post_keywords_post_id ON post_keywords(post_id);
