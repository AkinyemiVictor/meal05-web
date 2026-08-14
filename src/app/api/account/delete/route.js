import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { applyRateLimitHeaders, checkRateLimit } from "@/lib/api/rate-limit";
import { getOriginTrustContext } from "@/lib/api/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const payloadSchema = z.object({
  confirmation: z.literal("DELETE"),
});

const terminalOrderStatuses = "(delivered,cancelled,canceled,failed,stock_failed,refunded)";

const errorJson = (message, status, rl) =>
  applyRateLimitHeaders(NextResponse.json({ error: message }, { status }), rl);

const isMissingSchemaError = (error) =>
  ["42P01", "42703", "PGRST200", "PGRST204", "PGRST205"].includes(error?.code);

const ignoreMissingSchema = async (label, operation) => {
  const { error } = await operation;
  if (error && !isMissingSchemaError(error)) {
    throw new Error(`${label}: ${error.message || "failed"}`);
  }
};

const deleteByUserId = (admin, table, userId) =>
  ignoreMissingSchema(table, admin.from(table).delete().eq("user_id", userId));

const nullifyActor = (admin, table, column, userId) =>
  ignoreMissingSchema(`${table}.${column}`, admin.from(table).update({ [column]: null }).eq(column, userId));

export async function DELETE(request) {
  let rl = await checkRateLimit({ request, id: "account:delete:ip", limit: 10, windowMs: 60_000 });
  if (!rl.allowed) return errorJson("Too many attempts. Please try again shortly.", 429, rl);

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson("Confirmation is required before deleting this account.", 400, rl);
  }

  const admin = getSupabaseAdminClient();
  const originTrust = await getOriginTrustContext(request, admin);
  if (!originTrust.trusted) return errorJson("Request origin is not allowed.", 403, rl);

  const auth = getSupabaseRouteClient(await cookies());
  const { data: { user: cookieUser }, error: authErr } = await auth.auth.getUser();
  const user = originTrust.bearerUser || cookieUser || null;
  if (authErr && !user) return errorJson(authErr.message || "Not authenticated", 401, rl);
  if (!user?.id) return errorJson("Not authenticated", 401, rl);

  rl = await checkRateLimit({ request, id: `account:delete:user:${user.id}`, limit: 3, windowMs: 60_000 });
  if (!rl.allowed) return errorJson("Too many attempts. Please try again shortly.", 429, rl);

  try {
    const activeOrders = await admin
      .from("orders")
      .select("id", { head: true, count: "exact" })
      .eq("user_id", user.id)
      .not("status", "in", terminalOrderStatuses)
      .is("deleted_at", null);

    if (activeOrders.error && !isMissingSchemaError(activeOrders.error)) throw activeOrders.error;
    if ((activeOrders.count || 0) > 0) {
      return errorJson("Please complete or cancel active orders before deleting your account.", 409, rl);
    }

    const balanceResult = await admin.rpc("get_wallet_balance", { p_user_id: user.id });
    if (balanceResult.error && !isMissingSchemaError(balanceResult.error)) throw balanceResult.error;
    const walletBalance = Number(balanceResult.data || 0);
    if (Number.isFinite(walletBalance) && Math.abs(walletBalance) > 0.0001) {
      return errorJson("Please use or refund your Meal05 Balance before deleting your account.", 409, rl);
    }

    const now = new Date().toISOString();
    const anonymousOrderPatch = {
      user_id: null,
      delivery_address: null,
      delivery_house_number: null,
      delivery_street: null,
      delivery_landmark: null,
      delivery_address_label: null,
      delivery_contact_name: "Deleted account",
      delivery_contact_phone: null,
      customer_note: null,
      delivery_instructions: null,
      deleted_at: now,
      updated_at: now,
    };

    await deleteByUserId(admin, "cart_items", user.id);
    await deleteByUserId(admin, "favorites", user.id);
    await deleteByUserId(admin, "product_ratings", user.id);
    await deleteByUserId(admin, "payment_methods", user.id);
    await deleteByUserId(admin, "notifications", user.id);
    await deleteByUserId(admin, "user_addresses", user.id);
    await deleteByUserId(admin, "order_idempotency_keys", user.id);

    await ignoreMissingSchema(
      "orders",
      admin.from("orders").update(anonymousOrderPatch).eq("user_id", user.id)
    );
    await ignoreMissingSchema(
      "delivery_route_stops",
      admin
        .from("delivery_route_stops")
        .update({
          customer_id: null,
          customer_name: "Deleted account",
          customer_phone: "Deleted account",
          delivery_address: "Deleted account",
          delivery_landmark: null,
          updated_at: now,
        })
        .eq("customer_id", user.id)
    );
    await ignoreMissingSchema(
      "delivery_partners",
      admin
        .from("delivery_partners")
        .update({
          user_id: null,
          full_name: null,
          phone: null,
          email: null,
          is_active: false,
          updated_at: now,
        })
        .eq("user_id", user.id)
    );
    await nullifyActor(admin, "delivery_routes", "created_by", user.id);
    await nullifyActor(admin, "delivery_routes", "payment_approved_by", user.id);
    await nullifyActor(admin, "refunds", "created_by", user.id);
    await nullifyActor(admin, "wallet_transactions", "created_by", user.id);

    await deleteByUserId(admin, "wallet_transactions", user.id);
    await deleteByUserId(admin, "wallet_topups", user.id);
    await deleteByUserId(admin, "wallet_accounts", user.id);

    const userPatch = {
      name: null,
      first_name: null,
      last_name: null,
      email: null,
      phone: null,
      address: null,
      city: null,
      is_active: false,
      deleted_at: now,
      updated_at: now,
    };
    await ignoreMissingSchema("users.id", admin.from("users").update(userPatch).eq("id", user.id));
    await ignoreMissingSchema("users.auth_id", admin.from("users").update(userPatch).eq("auth_id", user.id));
    await ignoreMissingSchema("profiles.id", admin.from("profiles").delete().eq("id", user.id));
    await ignoreMissingSchema("profiles.user_id", admin.from("profiles").delete().eq("user_id", user.id));

    const deleteResult = await admin.auth.admin.deleteUser(user.id, true);
    if (deleteResult.error) throw deleteResult.error;

    try {
      await auth.auth.signOut();
    } catch {
      /* Session cookies are also cleared by the client after success. */
    }

    return applyRateLimitHeaders(NextResponse.json({ ok: true }, { status: 200 }), rl);
  } catch (error) {
    return errorJson(error?.message || "Unable to delete account right now.", 500, rl);
  }
}
