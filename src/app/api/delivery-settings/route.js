import { NextResponse } from "next/server";
import { loadDeliverySettings } from "@/lib/delivery-settings-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET() {
  try {
    const settings = await loadDeliverySettings();
    return NextResponse.json(
      { settings },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  } catch (error) {
    return NextResponse.json({ error: error?.message || "Failed to load delivery settings" }, { status: 500 });
  }
}
