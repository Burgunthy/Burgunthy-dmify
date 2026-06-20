# DMify 결제 시스템 구축 — Polar Edition

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** DMify에 Polar 기반 구독 결제 시스템을 구축하여, 무료/프로/비즈니스 3티어 요금제를 운영할 수 있게 한다.

**Architecture:** Polar Products (recurring) → Polar Checkout → Polar Webhook → Supabase subscriptions 테이블 동기화 → middleware에서 plan 기반 기능 제한. Polar Customer Portal로 구독 관리/해지. `@polar-sh/nextjs` 공식 SDK 사용.

**Tech Stack:** Next.js 15 App Router, Supabase (PostgreSQL + RLS), Polar (Checkout + Webhooks + Customer Portal), `@polar-sh/nextjs`, TypeScript strict.

---

## Assumptions & Constraints

| 항목 | 값 |
|------|-----|
| 결제 서비스 | **Polar** (MoR, 세금 자동 처리) |
| 한국 정산 | ✅ 지원 (Stripe Connect Express로 정산) |
| 수수료 | 5% + 50¢ (Starter 무료 플랜) |
| 기존 users.plan | `free` / `pro` / `business` (이미 존재) |
| Polar 서버 | 처음에 `sandbox`, 라이브 시 `production` |
| 배포 | Vercel 자동배포 (git push) |

---

## 요금제 정의 (초안 — 확정 필요)

| 기능 | Free | Pro | Business |
|------|------|-----|----------|
| 가격 | ₩0 | ₩19,900/월 | ₩49,900/월 |
| Instagram 계정 수 | 1개 | 3개 | 무제한 |
| 댓글→DM 처리 | 100건/월 | 1,000건/월 | 무제한 |
| 공개 댓글 답장 | ✅ | ✅ | ✅ |
| 키워드별 자동 DM | ❌ | ✅ | ✅ |
| 랜덤 추첨 (Raffle) | ❌ | ✅ | ✅ |
| 우선 지원 | ❌ | ❌ | ✅ |

---

## Phase 1: 인프라 — DB 스키마 + Polar 설정

### Task 1.1: `subscriptions` 테이블 생성

**Objective:** Polar 구독 상태를 저장할 테이블 생성

**Files:**
- Create: `supabase/migrations/20260620_subscriptions.sql`

**SQL:**
```sql
-- subscriptions: Polar 결제 구독 기록
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    polar_customer_id TEXT NOT NULL,
    polar_subscription_id TEXT NOT NULL UNIQUE,
    polar_product_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN (
        'active', 'trialing', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired'
    )),
    current_period_start TIMESTAMPTZ NOT NULL,
    current_period_end TIMESTAMPTZ NOT NULL,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, polar_subscription_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_polar_customer ON subscriptions(polar_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own subscriptions" ON subscriptions FOR SELECT USING (
    user_id IN (SELECT id FROM users WHERE auth.uid() = id)
);

CREATE TRIGGER subscriptions_updated_at BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

**Verification:** Supabase SQL Editor 실행 후 `SELECT * FROM subscriptions LIMIT 1` 에러 없음.

**Commit:** `feat: add subscriptions table for Polar billing`

---

### Task 1.2: `usage` 테이블 생성

**Objective:** 월별 사용량 추적 (DM 발송 수, 댓글 처리 수) — plan 제한 체크용

**Files:**
- Create: `supabase/migrations/20260620_usage.sql`

**SQL:**
```sql
CREATE TABLE IF NOT EXISTS usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
    month TEXT NOT NULL,
    comments_received INTEGER DEFAULT 0,
    dms_sent INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, month)
);

CREATE INDEX IF NOT EXISTS idx_usage_user_month ON usage(user_id, month);

ALTER TABLE usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own usage" ON usage FOR SELECT USING (
    user_id IN (SELECT id FROM users WHERE auth.uid() = id)
);

CREATE TRIGGER usage_updated_at BEFORE UPDATE ON usage
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

**Commit:** `feat: add usage tracking table`

---

### Task 1.3: `plan_config` 테이블 생성

**Objective:** plan별 Polar Product ID 매핑 + 한도 정의

**Files:**
- Create: `supabase/migrations/20260620_plan_config.sql`

**SQL:**
```sql
CREATE TABLE IF NOT EXISTS plan_config (
    plan TEXT PRIMARY KEY CHECK (plan IN ('free', 'pro', 'business')),
    polar_product_id TEXT,                  -- Polar Product ID (free는 NULL)
    max_accounts INTEGER NOT NULL DEFAULT 1,
    max_dms_per_month INTEGER NOT NULL DEFAULT 100,
    features JSONB NOT NULL DEFAULT '{}',
    display_price TEXT NOT NULL DEFAULT '₩0',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO plan_config (plan, max_accounts, max_dms_per_month, features, display_price) VALUES
    ('free',     1,   100,   '{"keyword_dm": false, "raffle": false, "analytics": "basic"}',     '₩0'),
    ('pro',      3,   1000,  '{"keyword_dm": true,  "raffle": true,  "analytics": "basic"}',     '₩19,900/월'),
    ('business', -1,  -1,    '{"keyword_dm": true,  "raffle": true,  "analytics": "detailed"}',   '₩49,900/월')
ON CONFLICT (plan) DO NOTHING;

ALTER TABLE plan_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authenticated can read plan_config" ON plan_config FOR SELECT USING (auth.uid() IS NOT NULL);
```

**Commit:** `feat: add plan_config table with tier limits`

---

### Task 1.4: `users` 테이블에 `polar_customer_id` 컬럼 추가

**Objective:** 사용자와 Polar Customer를 연결

**Files:**
- Create: `supabase/migrations/20260620_add_polar_customer_id.sql`

**SQL:**
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS polar_customer_id TEXT;
```

**Commit:** `feat: add polar_customer_id to users table`

---

### Task 1.5: Polar 계정 생성 + 제품 등록 (Taehyeon 전용)

**Objective:** Polar에 가입하고 Pro/Business 제품을 생성

**Taehyeon이 직접 수행:**

1. **Polar 가입**: https://polar.sh/signup (GitHub/Google 이메일)
2. **Organization 생성**: DMify organization
3. **정산 설정**: Settings → Payouts → Stripe Connect Express 연결 (한국 개인/법인)
4. **Products 생성** (2개):
   - **DMify Pro**: Type = Subscription, Price = ₩19,900, Recurring = Monthly
     → Product ID 복사
   - **DMify Business**: Type = Subscription, Price = ₩49,900, Recurring = Monthly
     → Product ID 복사
5. **토큰 발급**: Dashboard → Settings → Integrations → Access Token 생성
6. **Webhook Secret**: Dashboard → Settings → Integrations → Webhook → Secret 생성

**Deliverables (Taehyeon → Hermes):**
```
POLAR_ACCESS_TOKEN=plat_xxx
POLAR_WEBHOOK_SECRET=whsec_xxx
POLAR_PRO_PRODUCT_ID=prod_xxx
POLAR_BUSINESS_PRODUCT_ID=prod_xxx
```

---

## Phase 2: Polar 연동 (Backend)

### Task 2.1: `@polar-sh/nextjs` 설치

**Objective:** Polar 공식 Next.js SDK 추가

**Files:**
- Modify: `package.json`

**Step 1: Install**
```bash
cd /home/jth/projects/auto-instagram/dmify
npm install @polar-sh/nextjs
```

**Step 2: Verify**
```bash
npm ls @polar-sh/nextjs
```
Expected: `@polar-sh/nextjs@latest`

**Commit:** `chore: add @polar-sh/nextjs dependency`

---

### Task 2.2: Checkout Route 생성

**Objective:** `/checkout` — Polar Checkout으로 리다이렉트

**Files:**
- Create: `src/app/checkout/route.ts`

**코드 (공식 SDK 기반):**
```typescript
import { Checkout } from "@polar-sh/nextjs";

export const GET = Checkout({
  accessToken: process.env.POLAR_ACCESS_TOKEN!,
  successUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?upgraded=true`,
  returnUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/pricing`,
  server: process.env.POLAR_SERVER as "sandbox" | "production" || "sandbox",
});
```

**호출 방식:**
```
GET /checkout?products=<POLAR_PRO_PRODUCT_ID>&customerEmail=<user_email>&customerExternalId=<user_id>
```

- `products`: Polar Product ID (Pro 또는 Business)
- `customerEmail`: 사용자 이메일 (자동 Customer 생성)
- `customerExternalId`: Supabase user ID (Customer 매핑용)

**Commit:** `feat: add Polar checkout route`

---

### Task 2.3: Webhook Route 생성

**Objective:** `/api/webhook/polar` — Polar 이벤트 수신 → DB 동기화

**Files:**
- Create: `src/app/api/webhook/polar/route.ts`

**이벤트 처리:**
| Polar 이벤트 | 동작 |
|---------------|------|
| `subscription_created` | subscriptions 테이블 insert + users.plan 업데이트 |
| `subscription_active` | 구독 활성화 처리 |
| `subscription_updated` | 상태/기간 업데이트 |
| `subscription_canceled` | users.plan = 'free' |
| `subscription_revoked` | users.plan = 'free' (즉시 해지) |
| `order_paid` | 사용량 리셋 (새 결제 주기) |

**코드:**
```typescript
import { Webhooks } from "@polar-sh/nextjs";
import { createClient } from "@/lib/supabase/server";

export const POST = Webhooks({
  webhookSecret: process.env.POLAR_WEBHOOK_SECRET!,

  onSubscriptionCreated: async (payload) => {
    const sub = payload.data;
    const externalId = sub.customer?.externalId;
    if (!externalId) return;

    const supabase = await createClient();
    const plan = resolvePlan(sub.productId);

    // Upsert subscription
    await supabase.from("subscriptions").upsert({
      user_id: externalId,
      polar_customer_id: sub.customerId,
      polar_subscription_id: sub.id,
      polar_product_id: sub.productId,
      status: sub.status,
      current_period_start: sub.currentPeriodStart,
      current_period_end: sub.currentPeriodEnd,
    }, { onConflict: "user_id,polar_subscription_id" });

    // Update user plan
    await supabase.from("users").update({ plan, polar_customer_id: sub.customerId }).eq("id", externalId);

    console.log(`[polar:webhook] subscription created: ${plan} for user ${externalId}`);
  },

  onSubscriptionUpdated: async (payload) => {
    const sub = payload.data;
    const supabase = await createClient();

    await supabase.from("subscriptions").update({
      status: sub.status,
      current_period_start: sub.currentPeriodStart,
      current_period_end: sub.currentPeriodEnd,
      cancel_at_period_end: sub.cancelAtPeriodEnd,
    }).eq("polar_subscription_id", sub.id);

    console.log(`[polar:webhook] subscription updated: ${sub.id} → ${sub.status}`);
  },

  onSubscriptionCanceled: async (payload) => {
    const sub = payload.data;
    const externalId = sub.customer?.externalId;
    if (!externalId) return;

    const supabase = await createClient();

    await supabase.from("subscriptions").update({ status: "canceled" }).eq("polar_subscription_id", sub.id);
    await supabase.from("users").update({ plan: "free" }).eq("id", externalId);

    console.log(`[polar:webhook] subscription canceled for user ${externalId}`);
  },

  onSubscriptionRevoked: async (payload) => {
    const sub = payload.data;
    const externalId = sub.customer?.externalId;
    if (!externalId) return;

    const supabase = await createClient();

    await supabase.from("subscriptions").update({ status: "canceled" }).eq("polar_subscription_id", sub.id);
    await supabase.from("users").update({ plan: "free" }).eq("id", externalId);

    console.log(`[polar:webhook] subscription revoked for user ${externalId}`);
  },
});

// Polar Product ID → DMify plan mapping
const PRODUCT_PLAN_MAP: Record<string, string> = {
  [process.env.POLAR_PRO_PRODUCT_ID || ""]: "pro",
  [process.env.POLAR_BUSINESS_PRODUCT_ID || ""]: "business",
};

function resolvePlan(productId: string): string {
  return PRODUCT_PLAN_MAP[productId] || "free";
}
```

**Verification:** `curl` 또는 Polar CLI로 test webhook 전송 후 DB 확인.

**Commit:** `feat: add Polar webhook endpoint for subscription lifecycle`

---

### Task 2.4: Customer Portal Route 생성

**Objective:** `/portal` — 구독 관리/해지를 위한 Polar Customer Portal로 리다이렉트

**Files:**
- Create: `src/app/portal/route.ts`

**코드 (공식 SDK 기반):**
```typescript
import { CustomerPortal } from "@polar-sh/nextjs";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const GET = CustomerPortal({
  accessToken: process.env.POLAR_ACCESS_TOKEN!,
  server: process.env.POLAR_SERVER as "sandbox" | "production" || "sandbox",
  returnUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings`,
  getCustomerId: async (req: NextRequest) => {
    // Supabase에서 현재 사용자의 polar_customer_id 조회
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data } = await supabase
      .from("users")
      .select("polar_customer_id")
      .eq("id", user.id)
      .single();

    if (!data?.polar_customer_id) {
      throw new Error("No Polar customer found");
    }
    return data.polar_customer_id;
  },
});
```

**Commit:** `feat: add Polar customer portal route`

---

### Task 2.5: Webhook에서 사용량 카운트 + plan 제한

**Objective:** DM 발송 시 usage 업데이트 + 한도 체크

**Files:**
- Create: `src/lib/plan-guard.ts`
- Create: `supabase/migrations/20260620_increment_usage_rpc.sql`
- Modify: `src/app/api/webhook/route.ts` (DM 전송 전후)

**RPC 함수:**
```sql
CREATE OR REPLACE FUNCTION increment_usage(
  p_user_id UUID,
  p_account_id UUID,
  p_month TEXT,
  p_field TEXT
) RETURNS VOID AS $$
BEGIN
  INSERT INTO usage (user_id, account_id, month, dms_sent, comments_received)
  VALUES (p_user_id, p_account_id, p_month, 0, 0)
  ON CONFLICT (user_id, month) DO NOTHING;

  EXECUTE format(
    'UPDATE usage SET %I = %I + 1, updated_at = NOW() WHERE user_id = $1 AND month = $2',
    p_field, p_field
  ) USING p_user_id, p_month;
END;
$$ LANGUAGE plpgsql;
```

**`src/lib/plan-guard.ts`:**
```typescript
import type { SupabaseClient } from "@supabase/supabase-js";

export async function canSendDm(
  supabase: SupabaseClient,
  userId: string
): Promise<{ allowed: boolean; reason?: string; used: number; limit: number }> {
  const { data: user } = await supabase
    .from("users")
    .select("plan")
    .eq("id", userId)
    .single();

  const plan = user?.plan || "free";

  const { data: config } = await supabase
    .from("plan_config")
    .select("max_dms_per_month")
    .eq("plan", plan)
    .single();

  const limit = config?.max_dms_per_month ?? 100;
  if (limit === -1) return { allowed: true, used: 0, limit: -1 };

  const month = new Date().toISOString().slice(0, 7);
  const { data: usageRow } = await supabase
    .from("usage")
    .select("dms_sent")
    .eq("user_id", userId)
    .eq("month", month)
    .single();

  const used = usageRow?.dms_sent ?? 0;
  if (used >= limit) {
    return {
      allowed: false,
      reason: `Monthly DM limit reached (${used}/${limit}). Upgrade your plan.`,
      used, limit,
    };
  }
  return { allowed: true, used, limit };
}
```

**webhook route.ts에 guard 추가 (DM 전송 전):**
```typescript
import { canSendDm } from "@/lib/plan-guard";

// handleComment() 내, DM 전송 블록 전:
const accountOwner = await supabase
  .from("users")
  .select("id")
  .eq("id", /* userId from accounts join */)
  .single();

const dmCheck = await canSendDm(supabase, accountOwner.data?.id);
if (!dmCheck.allowed) {
  console.log(`[webhook] DM blocked: ${dmCheck.reason}`);
  await markFailed(supabase, commentId, dmCheck.reason || "Plan limit reached");
  return;
}
```

**webhook route.ts에 usage 증가 (DM 전송 성공 후):**
```typescript
// DM 전송 성공 직후:
const month = new Date().toISOString().slice(0, 7);
await supabase.rpc("increment_usage", {
  p_user_id: userId,
  p_account_id: account.id,
  p_month: month,
  p_field: "dms_sent",
});
```

**Commit:** `feat: add plan-based DM limit enforcement and usage tracking`

---

## Phase 3: 프론트엔드 — 결제 UI

### Task 3.1: 요금제 비교 페이지

**Objective:** `/dashboard/pricing` — 3개 티어 카드 비교 + Polar Checkout 링크

**Files:**
- Create: `src/app/dashboard/pricing/page.tsx`
- Modify: `src/app/dashboard/layout.tsx` (nav에 Pricing 추가)

**UI 구조:**
```
┌─────────────────────────────────────────────────┐
│  Choose Your Plan                                │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │  FREE    │  │  PRO ★  │  │ BUSINESS │      │
│  │  ₩0      │  │  ₩19,900 │  │  ₩49,900 │      │
│  │          │  │   /월    │  │   /월    │      │
│  │  1 계정  │  │  3 계정  │  │  무제한  │      │
│  │  100 DM  │  │  1,000DM │  │  무제한  │      │
│  │          │  │          │  │          │      │
│  │ 현재 요금│  │[결제하기]│  │[결제하기]│      │
│  └──────────┘  └──────────┘  └──────────┘      │
└─────────────────────────────────────────────────┘
```

**결제 버튼 클릭 시:**
```typescript
// Polar Checkout으로 리다이렉트
const checkoutUrl = `/checkout?products=${productId}&customerEmail=${user.email}&customerExternalId=${user.id}`;
router.push(checkoutUrl);
```

**Commit:** `feat: add pricing page with Polar checkout integration`

---

### Task 3.2: 대시보드 사용량 표시

**Objective:** Dashboard 상단에 현재 plan + 월간 DM 사용량 바

**Files:**
- Modify: `src/app/dashboard/page.tsx`

**UI:**
```
┌────────────────────────────────────────┐
│  📊 Plan: Pro  │  DM 사용량           │
│                 │  ████████░░░ 430/1000│
└────────────────────────────────────────┘
```

**Commit:** `feat: add usage meter to dashboard`

---

### Task 3.3: 업그레이드 배너

**Objective:** 무료 사용자 대시보드 상단에 업그레이드 유도 배너

**Files:**
- Modify: `src/app/dashboard/page.tsx`

**Commit:** `feat: add upgrade banner for free users`

---

### Task 3.4: Settings에 구독 관리 버튼

**Objective:** Settings 페이지에 "구독 관리" 버튼 → `/portal` (Polar Customer Portal)

**Files:**
- Modify: `src/app/dashboard/settings/page.tsx`

**Commit:** `feat: add subscription management link to settings`

---

### Task 3.5: 계정 연결 시 plan 제한 체크

**Objective:** 계정 연결 시 plan의 max_accounts 초과 방지

**Files:**
- Modify: `src/app/api/accounts/connect/route.ts`

**Commit:** `feat: enforce account limit based on plan`

---

## Phase 4: 배포 + 환경설정

### Task 4.1: Vercel 환경변수 설정

**명령어 (Taehyeon이 토큰 주면 실행):**
```bash
cd /home/jth/projects/auto-instagram/dmify

vercel env add POLAR_ACCESS_TOKEN production
vercel env add POLAR_WEBHOOK_SECRET production

# .env.local도 업데이트
```

---

### Task 4.2: Polar Webhook 엔드포인트 등록 (Taehyeon)

**Taehyeon이 직접 수행:**

1. Polar Dashboard → Settings → Integrations → Webhooks
2. URL: `https://commentlink-xi.vercel.app/api/webhook/polar`
3. Events: `subscription.*`, `order.paid`

---

### Task 4.3: E2E 테스트

**테스트 시나리오:**
1. 대시보드 → Pricing → Pro 결제하기
2. Polar Checkout (sandbox) → 결제 완료
3. `/dashboard?upgraded=true` 리다이렉트
4. DB: `users.plan = 'pro'`, `subscriptions` row 확인
5. Dashboard: usage meter Pro로 표시
6. Settings → 구독 관리 → Polar Portal 열림
7. Portal에서 구독 취소
8. Webhook → `users.plan = 'free'` 복원

---

## Task Summary

| # | Task | Phase | Files | Est. |
|---|------|-------|-------|------|
| 1.1 | subscriptions 테이블 | 1 | migration SQL | 10m |
| 1.2 | usage 테이블 | 1 | migration SQL | 10m |
| 1.3 | plan_config 테이블 | 1 | migration SQL | 10m |
| 1.4 | users에 polar_customer_id | 1 | migration SQL | 5m |
| 1.5 | **Polar 계정 생성 (Taehyeon)** | 1 | — | 20m |
| 2.1 | SDK 설치 | 2 | package.json | 5m |
| 2.2 | Checkout route | 2 | app/checkout/route.ts | 15m |
| 2.3 | Webhook route | 2 | app/api/webhook/polar | 30m |
| 2.4 | Customer Portal route | 2 | app/portal/route.ts | 20m |
| 2.5 | usage + plan guard | 2 | lib/plan-guard + webhook | 30m |
| 3.1 | 요금제 비교 페이지 | 3 | pricing/page | 45m |
| 3.2 | 대시보드 사용량 UI | 3 | dashboard/page | 30m |
| 3.3 | 업그레이드 배너 | 3 | dashboard/page | 15m |
| 3.4 | Settings 구독 관리 | 3 | settings/page | 15m |
| 3.5 | 계정 연결 제한 | 3 | api/accounts/connect | 20m |
| 4.1 | Vercel 환경변수 | 4 | — | 10m |
| 4.2 | Webhook 등록 (Taehyeon) | 4 | — | 10m |
| 4.3 | E2E 테스트 | 4 | — | 30m |

**총 예상 시간:** ~6시간 (개발 4-5시간 + Taehyeon 작업 1시간)

---

## Polar vs Stripe 코드량 비교

| 구성요소 | Stripe | Polar |
|---------|--------|-------|
| SDK 설치 | 2 패키지 | 1 패키지 |
| Checkout | 커스텀 API route 50줄 | **SDK 한 줄** |
| Webhook | 커스텀 서명 검증 80줄 | **SDK handler** |
| Customer Portal | 커스텀 API route 30줄 | **SDK 한 줄** |
| 세금 처리 | 직접 구현 | **MoR 자동** |
| **총 신규 코드량** | ~300줄 | **~150줄** |

---

## Risks & Open Questions

| 리스크 | 완화 |
|--------|------|
| Polar 한국 원화(KRW) 결제 지원 여부 | 테스트 필요. USD로 대체 가능 |
| `@polar-sh/nextjs` SDK의 webhook payload 타입 | 공식 문서 기반 작성, 실제 payload 확인 필요 |
| 한 사용자 = 한 구독 (Polar 기본) | DMify에도 1 plan만 필요하므로 문제없음 |
| sandbox → production 전환 | 환경변수 `POLAR_SERVER`로 제어 |

**Open Questions (Taehyeon):**
1. **요금제 가격**: ₩19,900 / ₩49,900 확정?
2. **무료 DM 한도**: 100건/월 적절?
3. **Polar 가입**: GitHub or Google 이메일로?
