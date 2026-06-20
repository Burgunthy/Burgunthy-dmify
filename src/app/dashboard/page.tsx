import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServerUserId } from "@/lib/auth-user";
import { DashboardContent } from "./dashboard-content";
import { UsageMeter } from "./usage-meter";
import { UpgradeBanner } from "./upgrade-banner";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const userId = await getServerUserId();
  if (!userId) redirect("/auth/login");

  const supabase = await createClient();

  // Current plan
  const { data: userRow } = await supabase
    .from("users")
    .select("plan")
    .eq("id", userId)
    .maybeSingle();
  const plan = userRow?.plan ?? "free";

  // DM limit for the plan (-1 means unlimited)
  const { data: planConfig } = await supabase
    .from("plan_config")
    .select("max_dms_per_month")
    .eq("plan", plan)
    .maybeSingle();
  const limit = planConfig?.max_dms_per_month ?? 100;

  // This month's DM usage
  const month = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  const { data: usageRow } = await supabase
    .from("usage")
    .select("dms_sent")
    .eq("user_id", userId)
    .eq("month", month)
    .maybeSingle();
  const used = usageRow?.dms_sent ?? 0;

  return (
    <div className="space-y-6">
      <UsageMeter plan={plan} used={used} limit={limit} />
      {plan === "free" && <UpgradeBanner />}
      <DashboardContent />
    </div>
  );
}
