import { CreditCard } from "lucide-react";

const PLAN_LABELS: Record<string, string> = {
  free: "프리",
  pro: "프로",
  business: "비즈니스",
};

const PLAN_BADGES: Record<string, string> = {
  free: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  pro: "bg-primary-light text-primary dark:bg-primary/15 dark:text-primary",
  business: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

interface UsageMeterProps {
  plan: string;
  used: number;
  /** -1 means unlimited. */
  limit: number;
}

export function UsageMeter({ plan, used, limit }: UsageMeterProps) {
  const unlimited = limit === -1;
  const pct = unlimited
    ? 100
    : Math.min(100, limit > 0 ? Math.round((used / limit) * 100) : 0);
  const label = PLAN_LABELS[plan] ?? plan;
  const badge = PLAN_BADGES[plan] ?? PLAN_BADGES.free;

  // Bar colour shifts to amber/red as the user approaches the limit.
  const barColor =
    !unlimited && pct >= 100
      ? "bg-red-500"
      : !unlimited && pct >= 80
        ? "bg-amber-500"
        : "bg-primary";

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-primary" />
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            현재 요금제
          </span>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge}`}>
            {label}
          </span>
        </div>
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          이번 달 DM 사용량
        </span>
      </div>

      <div className="mt-4">
        {unlimited ? (
          <>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="font-semibold text-primary">무제한</span>
              <span className="text-zinc-500 dark:text-zinc-400">사용량 제한 없음</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-gradient-to-r from-primary/40 to-primary/10 dark:from-primary/30 dark:to-primary/5" />
          </>
        ) : (
          <>
            <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                {used.toLocaleString()} / {limit.toLocaleString()} DM
              </span>
              <span>{pct}%</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div
                className={`h-2.5 rounded-full transition-all ${barColor}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
