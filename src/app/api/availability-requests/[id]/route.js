import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { AVAILABILITY_REQUEST_SELECT, expireAvailabilityRequest } from "@/lib/availability-requests-server";

export async function GET(_request, { params }) {
  const { id } = await params;
  const auth = getSupabaseRouteClient(await cookies());
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.from("availability_requests").select(AVAILABILITY_REQUEST_SELECT)
    .eq("id", id).eq("user_id", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Availability request not found" }, { status: 404 });
  return NextResponse.json({ request: await expireAvailabilityRequest(admin, data) });
}

