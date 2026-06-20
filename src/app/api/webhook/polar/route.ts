import { Webhooks } from "@polar-sh/nextjs";
import { getServiceClient } from "@/lib/supabase/server";

/** Map Polar product IDs to internal plan names. */
function planForProduct(productId: string): string {
  if (productId === process.env.POLAR_PRO_PRODUCT_ID) return "pro";
  if (productId === process.env.POLAR_BUSINESS_PRODUCT_ID) return "business";
  return "free";
}

/**
 * Resolve a Polar customer back to a Supabase user ID.
 * We store the user's Supabase uid in the Polar customer metadata under the key
 * "supabase_user_id".  Falls back to looking up by polar_customer_id in users table.
 */
async function resolveUserId(
  customerId: string,
  customerMetadata?: Record<string, unknown>
): Promise<string | null> {
  // 1. Check metadata first (most reliable)
  if (customerMetadata?.["supabase_user_id"]) {
    return customerMetadata["supabase_user_id"] as string;
  }

  // 2. Fallback: look up by polar_customer_id in users table
  const supabase = await getServiceClient();
  const { data } = await supabase
    .from("users")
    .select("id")
    .eq("polar_customer_id", customerId)
    .single();

  return data?.id ?? null;
}

/** Upsert a subscription row. */
async function upsertSubscription(sub: {
  id: string;
  userId: string;
  customerId: string;
  productId: string;
  status: string;
  amount: number;
  currency: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
}) {
  const supabase = await getServiceClient();
  await supabase.from("subscriptions").upsert(
    {
      id: sub.id,
      user_id: sub.userId,
      polar_customer_id: sub.customerId,
      product_id: sub.productId,
      status: sub.status,
      amount: sub.amount,
      currency: sub.currency,
      current_period_start: sub.currentPeriodStart,
      current_period_end: sub.currentPeriodEnd,
      cancel_at_period_end: sub.cancelAtPeriodEnd,
      canceled_at: sub.canceledAt,
      started_at: sub.startedAt,
      ended_at: sub.endedAt,
    },
    { onConflict: "id" }
  );
}

/** Update a user's plan. */
async function updateUserPlan(userId: string, plan: string) {
  const supabase = await getServiceClient();
  await supabase.from("users").update({ plan }).eq("id", userId);
}

export const POST = Webhooks({
  webhookSecret: process.env.POLAR_WEBHOOK_SECRET!,

  onSubscriptionCreated: async (payload) => {
    const sub = payload.data;
    const userId = await resolveUserId(sub.customerId, sub.customer?.metadata as Record<string, unknown> | undefined);
    if (!userId) {
      console.error(`[polar] subscription.created: could not resolve user for customer ${sub.customerId}`);
      return;
    }

    const plan = planForProduct(sub.productId);

    await upsertSubscription({
      id: sub.id,
      userId,
      customerId: sub.customerId,
      productId: sub.productId,
      status: sub.status,
      amount: sub.amount,
      currency: sub.currency,
      currentPeriodStart: sub.currentPeriodStart instanceof Date ? sub.currentPeriodStart.toISOString() : String(sub.currentPeriodStart),
      currentPeriodEnd: sub.currentPeriodEnd instanceof Date ? sub.currentPeriodEnd.toISOString() : String(sub.currentPeriodEnd),
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      canceledAt: sub.canceledAt instanceof Date ? sub.canceledAt.toISOString() : null,
      startedAt: sub.startedAt instanceof Date ? sub.startedAt.toISOString() : null,
      endedAt: sub.endedAt instanceof Date ? sub.endedAt.toISOString() : null,
    });

    await updateUserPlan(userId, plan);
    console.log(`[polar] subscription.created: user ${userId} → plan ${plan}`);
  },

  onSubscriptionUpdated: async (payload) => {
    const sub = payload.data;
    const userId = await resolveUserId(sub.customerId, sub.customer?.metadata as Record<string, unknown> | undefined);
    if (!userId) {
      console.error(`[polar] subscription.updated: could not resolve user for customer ${sub.customerId}`);
      return;
    }

    await upsertSubscription({
      id: sub.id,
      userId,
      customerId: sub.customerId,
      productId: sub.productId,
      status: sub.status,
      amount: sub.amount,
      currency: sub.currency,
      currentPeriodStart: sub.currentPeriodStart instanceof Date ? sub.currentPeriodStart.toISOString() : String(sub.currentPeriodStart),
      currentPeriodEnd: sub.currentPeriodEnd instanceof Date ? sub.currentPeriodEnd.toISOString() : String(sub.currentPeriodEnd),
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      canceledAt: sub.canceledAt instanceof Date ? sub.canceledAt.toISOString() : null,
      startedAt: sub.startedAt instanceof Date ? sub.startedAt.toISOString() : null,
      endedAt: sub.endedAt instanceof Date ? sub.endedAt.toISOString() : null,
    });

    console.log(`[polar] subscription.updated: user ${userId} → status ${sub.status}`);
  },

  onSubscriptionCanceled: async (payload) => {
    const sub = payload.data;
    const userId = await resolveUserId(sub.customerId, sub.customer?.metadata as Record<string, unknown> | undefined);
    if (!userId) {
      console.error(`[polar] subscription.canceled: could not resolve user for customer ${sub.customerId}`);
      return;
    }

    const supabase = await getServiceClient();
    await supabase
      .from("subscriptions")
      .update({
        status: "canceled",
        cancel_at_period_end: sub.cancelAtPeriodEnd,
        canceled_at: sub.canceledAt instanceof Date ? sub.canceledAt.toISOString() : null,
      })
      .eq("id", sub.id);

    // If subscription ends immediately (not at period end), downgrade now
    if (!sub.cancelAtPeriodEnd) {
      await updateUserPlan(userId, "free");
    }

    console.log(`[polar] subscription.canceled: user ${userId} (cancel_at_period_end=${sub.cancelAtPeriodEnd})`);
  },

  onSubscriptionRevoked: async (payload) => {
    const sub = payload.data;
    const userId = await resolveUserId(sub.customerId, sub.customer?.metadata as Record<string, unknown> | undefined);
    if (!userId) {
      console.error(`[polar] subscription.revoked: could not resolve user for customer ${sub.customerId}`);
      return;
    }

    const supabase = await getServiceClient();
    await supabase
      .from("subscriptions")
      .update({
        status: "canceled",
        ended_at: sub.endedAt instanceof Date ? sub.endedAt.toISOString() : new Date().toISOString(),
      })
      .eq("id", sub.id);

    await updateUserPlan(userId, "free");
    console.log(`[polar] subscription.revoked: user ${userId} → plan free`);
  },

  onPayload: async (payload) => {
    console.log(`[polar] unhandled event: ${payload.type}`);
  },
});
