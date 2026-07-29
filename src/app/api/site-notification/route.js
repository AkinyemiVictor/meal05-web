import { NextResponse } from "next/server";
import { withNoStore } from "@/lib/api/no-store";
import { loadActiveSiteNotification } from "@/lib/site-notifications-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { notification } = await loadActiveSiteNotification();
    return withNoStore(NextResponse.json({ notification }));
  } catch (error) {
    console.error("Site notification lookup failed", error);
    return withNoStore(NextResponse.json({ notification: null }));
  }
}
