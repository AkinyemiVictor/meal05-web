import { formatTagDeadline } from "@/lib/tag-buy";
import { formatQuantity } from "@/lib/purchase-quantities";

export default function TagBuyProgress({ batch, compact = false }) {
  if (!batch?.id) return null;
  const progress = Math.max(0, Math.min(100, Number(batch.progressPercent || 0)));
  return (
    <div className={compact ? "mt-2 rounded-xl bg-amber-50 p-2" : "my-4 rounded-2xl border border-amber-200 bg-amber-50 p-4"}>
      <div className="flex items-center justify-between gap-3 text-xs font-semibold text-amber-950">
        <span>Tag Buy</span>
        <span>{progress}% funded</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-amber-200" aria-label={`${progress}% of Tag Buy target reached`}>
        <div className="h-full rounded-full bg-amber-600" style={{ width: `${progress}%` }} />
      </div>
      <p className="mt-2 text-xs leading-5 text-amber-900">
        {formatQuantity(batch.committedQuantity || 0, batch.contributionUnit)} of {formatQuantity(batch.targetQuantity || 0, batch.contributionUnit)} committed · closes {formatTagDeadline(batch.closesAt)}
      </p>
      {!compact ? (
        <p className="mt-1 text-xs leading-5 text-amber-800">
          Delivery timing starts after the group closes. If the minimum is missed, the batch&apos;s {batch.failurePolicy === "carry_forward" ? "carry-forward" : "refund"} policy applies.
        </p>
      ) : null}
    </div>
  );
}
