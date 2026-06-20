"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, X } from "lucide-react";

/** Dismissible upsell banner shown to free-plan users. */
export function UpgradeBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="relative flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-gradient-to-r from-primary-light to-pink-50 p-4 dark:border-primary/30 dark:from-primary/10 dark:to-pink-950/20">
      <p className="pr-8 text-sm font-medium text-zinc-800 dark:text-zinc-100">
        💡 Pro 요금제로 업그레이드하여 더 많은 DM을 보내세요!
      </p>
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/pricing"
          className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
        >
          요금제 보기
          <ArrowRight className="h-4 w-4" />
        </Link>
        <button
          onClick={() => setDismissed(true)}
          aria-label="닫기"
          className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-black/5 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-200"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
