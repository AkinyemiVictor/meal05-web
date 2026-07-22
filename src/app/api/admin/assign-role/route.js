import { cookies } from "next/headers";
import { z } from "zod";
import { NextResponse } from "next/server";
import { hasAdminPermission, getAdminAccessProfile } from "@/lib/admin-access";
import { USER_ROLE_OPTIONS, canAssignAdminRole } from "@/lib/admin-roles";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { checkRateLimit, applyRateLimitHeaders } from "@/lib/api/rate-limit";
import { logAdminEvent, logAdminError } from "@/lib/api/log";
import { respondZodError } from "@/lib/api/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLE_ALIASES = new Map([
  ["customer", "customer"],
  ["rider", "rider"],
  ["driver", "rider"],
  ["dispatcher", "dispatcher"],
  ["staff", "dispatcher"],
  ["warehouse", "dispatcher"],
  ["admin", "admin"],
  ["super_admin", "super_admin"],
  ["superadmin", "super_admin"],
]);

const normalizeAssignableRole = (role) => ROLE_ALIASES.get(String(role || "").trim().toLowerCase()) || null;
const toDatabaseRole = (role) => role;

export async function POST(req) {
  const rl = await checkRateLimit({ request: req, id: "admin:assign-role", limit: 30, windowMs: 60_000 });
  const auth = getSupabaseRouteClient(await cookies());
  const { data: { user }, error: authErr } = await auth.auth.getUser();
  if (authErr) {
    await logAdminError(authErr, { route: "/api/admin/assign-role", stage: "auth" });
    return applyRateLimitHeaders(NextResponse.json({ error: authErr.message }, { status: 401 }), rl);
  }
  if (!user) {
    await logAdminError("Not authenticated", { route: "/api/admin/assign-role", stage: "auth" });
    return applyRateLimitHeaders(NextResponse.json({ error: "Not authenticated" }, { status: 401 }), rl);
  }
  const actorProfile = await getAdminAccessProfile({ userId: user.id, email: user.email });
  const allowed = actorProfile.allowed && (await hasAdminPermission({ userId: user.id, email: user.email }, "manage_roles"));
  if (!allowed) {
    await logAdminError("Forbidden admin attempt", { route: "/api/admin/assign-role", actor: user.email });
    return applyRateLimitHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }), rl);
  }

  let body;
  try { body = await req.json(); } catch { return applyRateLimitHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 }), rl); }

  const schema = z.object({
    user_id: z.string().min(1, "user_id required"),
    role: z.string().min(1, "role required"),
  });
  const parsed = schema.safeParse(body || {});
  if (!parsed.success) {
    await logAdminError("Validation failed", { route: "/api/admin/assign-role", issues: parsed.error.issues });
    return applyRateLimitHeaders(respondZodError(parsed.error), rl);
  }

  const { user_id, role } = parsed.data;
  const normalizedRole = normalizeAssignableRole(role);
  if (!normalizedRole || !USER_ROLE_OPTIONS.some((option) => option.value === normalizedRole)) {
    await logAdminError("Invalid role selection", { route: "/api/admin/assign-role", actor: user.email, role });
    return applyRateLimitHeaders(NextResponse.json({ error: "Invalid role" }, { status: 400 }), rl);
  }

  const targetProfile = await getAdminAccessProfile({ userId: user_id });
  const allowedAssignment = canAssignAdminRole({
    actorRole: actorProfile.role,
    actorUserId: user.id,
    targetRole: targetProfile.role,
    targetUserId: user_id,
    nextRole: normalizedRole,
  });
  if (!allowedAssignment) {
    await logAdminError("Role assignment blocked", {
      route: "/api/admin/assign-role",
      actor: user.email,
      target_user_id: user_id,
      actor_role: actorProfile.role,
      target_role: targetProfile.role,
      requested_role: normalizedRole,
    });
    return applyRateLimitHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }), rl);
  }

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.rpc("assign_role", { user_id, role_name: toDatabaseRole(normalizedRole) });
  if (error) {
    await logAdminError(error, { route: "/api/admin/assign-role", actor: user.email, user_id, role });
    return applyRateLimitHeaders(NextResponse.json({ error: error.message }, { status: 400 }), rl);
  }
  await logAdminEvent({ route: "/api/admin/assign-role", actor: user.email, user_id, role: normalizedRole, ok: true });
  return applyRateLimitHeaders(NextResponse.json({ ok: true, data }), rl);
}
