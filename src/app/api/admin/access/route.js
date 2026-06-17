import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { hasAdminAccess } from "@/lib/admin-access";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const readBearerToken = (request) => {
  const header = request.headers.get("authorization") || request.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
};

export async function GET(request) {
  const auth = getSupabaseRouteClient(await cookies());
  const { data: { user: cookieUser }, error } = await auth.auth.getUser();
  let user = cookieUser || null;

  if (!user) {
    const token = readBearerToken(request);
    if (token) {
      try {
        const admin = getSupabaseAdminClient();
        const { data, error: tokenError } = await admin.auth.getUser(token);
        if (!tokenError && data?.user) {
          user = data.user;
        }
      } catch {
        // keep user as null
      }
    }
  }

  if (error || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const allowed = await hasAdminAccess({ userId: user.id, email: user.email });
  return NextResponse.json(
    {
      allowed,
      user: { id: user.id, email: user.email || "" },
    },
    { status: 200 }
  );
}
