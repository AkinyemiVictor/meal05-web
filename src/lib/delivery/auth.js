import "server-only";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { hasDispatchAccess } from "@/lib/admin-access";
import { withNoStore } from "@/lib/api/no-store";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";

export async function requireDispatchUser() {
  const auth = getSupabaseRouteClient(await cookies());
  const {
    data: { user },
    error,
  } = await auth.auth.getUser();
  if (error || !user) {
    return { response: withNoStore(NextResponse.json({ error: error?.message || "Not authenticated" }, { status: 401 })) };
  }
  const allowed = await hasDispatchAccess({ userId: user.id, email: user.email });
  if (!allowed) {
    return { response: withNoStore(NextResponse.json({ error: "Forbidden" }, { status: 403 })) };
  }
  return { user };
}

export async function requireCustomerUser() {
  const auth = getSupabaseRouteClient(await cookies());
  const {
    data: { user },
    error,
  } = await auth.auth.getUser();
  if (error || !user) {
    return { response: withNoStore(NextResponse.json({ error: error?.message || "Not authenticated" }, { status: 401 })) };
  }
  return { user };
}
