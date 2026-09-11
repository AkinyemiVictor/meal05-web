import { GET as getActiveTagBatches } from "@/app/api/tag-batches/active/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request) {
  return getActiveTagBatches(request);
}
