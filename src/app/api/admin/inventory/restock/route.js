import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasAdminAccess } from "@/lib/admin-access";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { checkRateLimit, applyRateLimitHeaders } from "@/lib/api/rate-limit";
import { logAdminEvent, logAdminError } from "@/lib/api/log";
import { respondZodError } from "@/lib/api/validate";
import { revalidatePublicCatalog } from "@/lib/catalog-cache-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STOCK_MOVEMENT_REASONS = new Set([
  "restock",
  "manual_adjustment",
  "spoilage",
  "order_deduction",
]);

const isMissingRpcFunctionError = (message) =>
  /function .*restock_variant_atomic.* does not exist|could not find the function public\.restock_variant_atomic/i.test(
    String(message || "")
  );

const toStockCount = (value) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) return null;
  return n;
};

const restockViaDirectUpdate = async ({ admin, user, variantId, quantity, reason, note }) => {
  const variantRes = await admin
    .from("product_variants")
    .select("id, product_id, name, stock_count")
    .eq("id", variantId)
    .maybeSingle();

  if (variantRes.error) {
    await logAdminError(variantRes.error, {
      route: "/api/admin/inventory/restock",
      actor: user.email,
      variant_id: variantId,
      quantity,
      stage: "fallback:load-variant",
    });
    return { response: NextResponse.json({ error: variantRes.error.message }, { status: 400 }) };
  }

  const variant = variantRes.data;
  if (!variant) {
    return { response: NextResponse.json({ error: "Variant not found" }, { status: 404 }) };
  }

  const beforeStock = toStockCount(variant.stock_count);
  if (beforeStock == null) {
    return { response: NextResponse.json({ error: "Variant stock_count is unavailable" }, { status: 400 }) };
  }

  const afterStock = beforeStock + quantity;
  if (!Number.isSafeInteger(afterStock) || afterStock < 0) {
    return { response: NextResponse.json({ error: "Variant stock_count overflow" }, { status: 400 }) };
  }

  const updateRes = await admin
    .from("product_variants")
    .update({ stock_count: afterStock })
    .eq("id", variantId)
    .select("id, product_id, name, stock_count")
    .maybeSingle();

  if (updateRes.error) {
    await logAdminError(updateRes.error, {
      route: "/api/admin/inventory/restock",
      actor: user.email,
      variant_id: variantId,
      quantity,
      after_stock: afterStock,
      stage: "fallback:update-variant",
    });
    return { response: NextResponse.json({ error: updateRes.error.message }, { status: 400 }) };
  }

  const updatedVariant = updateRes.data;
  if (!updatedVariant) {
    await logAdminError("Fallback restock update returned empty response", {
      route: "/api/admin/inventory/restock",
      actor: user.email,
      variant_id: variantId,
      quantity,
      stage: "fallback:update-empty",
    });
    return { response: NextResponse.json({ error: "Restock completed but response was empty." }, { status: 500 }) };
  }

  let ledgerWarning = "";
  const ledgerRes = await admin
    .from("stock_ledger")
    .insert({
      variant_id: variantId,
      change_qty: quantity,
      reason,
      source: "admin_restock",
      note,
    });

  if (ledgerRes.error) {
    ledgerWarning = "Stock updated, but stock ledger entry could not be recorded.";
    await logAdminError(ledgerRes.error, {
      route: "/api/admin/inventory/restock",
      actor: user.email,
      variant_id: variantId,
      quantity,
      reason,
      note,
      stage: "fallback:insert-stock-ledger",
    });
  }

  await logAdminEvent({
    route: "/api/admin/inventory/restock",
    actor: user.email,
    variant_id: variantId,
    product_id: updatedVariant.product_id ?? variant.product_id ?? null,
    movement_id: null,
    ledger_recorded: !ledgerRes.error,
    before_stock: beforeStock,
    added_stock: quantity,
    after_stock: updatedVariant.stock_count ?? afterStock,
    reason,
    note: note || undefined,
    fallback: true,
    movement_log_failed: Boolean(ledgerRes.error),
    ledger_log_failed: Boolean(ledgerRes.error),
    ok: true,
  });

  revalidatePublicCatalog();

  return {
    response: NextResponse.json({
      ok: true,
      fallback: true,
      warning: ledgerWarning || undefined,
      variant: {
        id: updatedVariant.id ?? variantId,
        product_id: updatedVariant.product_id ?? variant.product_id ?? null,
        name: updatedVariant.name || variant.name || "",
        stock_count: updatedVariant.stock_count ?? afterStock,
      },
      movementId: null,
      ledgerRecorded: !ledgerRes.error,
      beforeStock,
      added: quantity,
      afterStock: updatedVariant.stock_count ?? afterStock,
    }),
  };
};

export async function POST(req) {
  const rl = await checkRateLimit({ request: req, id: "admin:inventory:restock", limit: 60, windowMs: 60_000 });
  if (!rl.allowed) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Too many requests" }, { status: 429 }), rl);
  }

  const auth = getSupabaseRouteClient(await cookies());
  const { data: { user }, error: authErr } = await auth.auth.getUser();
  if (authErr) {
    await logAdminError(authErr, { route: "/api/admin/inventory/restock", stage: "auth" });
    return applyRateLimitHeaders(NextResponse.json({ error: authErr.message }, { status: 401 }), rl);
  }
  if (!user) {
    await logAdminError("Not authenticated", { route: "/api/admin/inventory/restock", stage: "auth" });
    return applyRateLimitHeaders(NextResponse.json({ error: "Not authenticated" }, { status: 401 }), rl);
  }

  const allowed = await hasAdminAccess({ userId: user.id, email: user.email });
  if (!allowed) {
    await logAdminError("Forbidden admin attempt", { route: "/api/admin/inventory/restock", actor: user.email });
    return applyRateLimitHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }), rl);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return applyRateLimitHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 }), rl);
  }

  const schema = z.object({
    variant_id: z.union([z.string(), z.number()]),
    quantity: z.number().int().positive().max(1_000_000),
    reason: z.string().trim().max(120).optional(),
    note: z.string().trim().max(500).optional(),
  });
  const parsed = schema.safeParse(body || {});
  if (!parsed.success) {
    await logAdminError("Validation failed", { route: "/api/admin/inventory/restock", issues: parsed.error.issues });
    return applyRateLimitHeaders(respondZodError(parsed.error), rl);
  }

  const admin = getSupabaseAdminClient();
  const variantIdText = String(parsed.data.variant_id).trim();
  const variantId = Number(variantIdText);
  if (!Number.isSafeInteger(variantId) || variantId < 1) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Invalid variant id" }, { status: 400 }), rl);
  }
  const quantity = Number(parsed.data.quantity);
  const reason = String(parsed.data.reason || "restock").toLowerCase();
  if (!STOCK_MOVEMENT_REASONS.has(reason)) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: `Unsupported stock movement reason: ${reason}` }, { status: 400 }),
      rl
    );
  }
  const note = parsed.data.note || null;

  const { data: rpcData, error: rpcErr } = await admin.rpc("restock_variant_atomic", {
    variant_id_input: variantId,
    change_quantity_input: quantity,
    reason_input: reason,
    note_input: note,
  });

  if (rpcErr) {
    if (isMissingRpcFunctionError(rpcErr.message)) {
      const fallback = await restockViaDirectUpdate({
        admin,
        user,
        variantId,
        quantity,
        reason,
        note,
      });
      return applyRateLimitHeaders(fallback.response, rl);
    }

    await logAdminError(rpcErr, {
      route: "/api/admin/inventory/restock",
      actor: user.email,
      variant_id: variantId,
      quantity,
      reason,
      note,
      stage: "rpc:restock_variant_atomic",
    });

    const message = String(rpcErr.message || "");
    if (/variant not found/i.test(message)) {
      return applyRateLimitHeaders(NextResponse.json({ error: "Variant not found" }, { status: 404 }), rl);
    }
    return applyRateLimitHeaders(NextResponse.json({ error: message || "Restock failed" }, { status: 400 }), rl);
  }

  const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  if (!row || typeof row !== "object") {
    await logAdminError("RPC restock returned empty response", {
      route: "/api/admin/inventory/restock",
      actor: user.email,
      variant_id: variantId,
      quantity,
    });
    return applyRateLimitHeaders(NextResponse.json({ error: "Restock completed but response was empty." }, { status: 500 }), rl);
  }

  await logAdminEvent({
    route: "/api/admin/inventory/restock",
    actor: user.email,
    variant_id: variantId,
    product_id: row.product_id ?? null,
    movement_id: row.movement_id ?? null,
    before_stock: row.before_stock,
    added_stock: quantity,
    after_stock: row.after_stock,
    reason,
    note: note || undefined,
    fallback: false,
    ok: true,
  });

  revalidatePublicCatalog();

  return applyRateLimitHeaders(
    NextResponse.json({
      ok: true,
      variant: {
        id: row.variant_id ?? variantId,
        product_id: row.product_id ?? null,
        name: row.variant_name || "",
        stock_count: row.after_stock,
      },
      movementId: row.movement_id ?? null,
      beforeStock: row.before_stock,
      added: quantity,
      afterStock: row.after_stock,
    }),
    rl
  );
}
