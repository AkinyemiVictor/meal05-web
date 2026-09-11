import { NextResponse } from "next/server";
import { loadTagBatch } from "@/lib/tag-buy-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  const { id } = await params;
  try {
    const batch = await loadTagBatch(id);
    if (!batch || batch.status === "draft") return NextResponse.json({ error: "Tag Buy not found." }, { status: 404 });
    return NextResponse.json({ batch }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Unable to load Tag Buy." }, { status: 500 });
  }
}

