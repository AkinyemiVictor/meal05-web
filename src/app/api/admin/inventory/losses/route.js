import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasAdminAccess } from "@/lib/admin-access";
import { checkRateLimit, applyRateLimitHeaders } from "@/lib/api/rate-limit";
import { logAdminEvent, logAdminError } from "@/lib/api/log";
import { respondZodError } from "@/lib/api/validate";
import { getInventoryLossMovementReason, isInventoryLossType, normalizeInventoryLossType } from "@/lib/inventory-loss";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { revalidatePublicCatalog } from "@/lib/catalog-cache-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isMissingInventoryLossRpcError = (message) =>
  /function .*record_inventory_loss_atomic.* does not exist|could not find the function public\.record_inventory_loss_atomic/i.test(
    String(message || "")
  );

const isMissingInventoryLossSchemaError = (message) =>
  /relation .*inventory_loss_events.* does not exist|column .*inventory_loss_events.* does not exist|schema cache/i.test(
    String(message || "")
  );

export async function POST(req) {
  const rl = await checkRateLimit({ request: req, id: "admin:inventory:losses", limit: 60, windowMs: 60_000 });
  if (!rl.allowed) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Too many requests" }, { status: 429 }), rl);
  }

  const auth = getSupabaseRouteClient(await cookies());
  const {
    data: { user },
    error: authErr,
  } = await auth.auth.getUser();
  if (authErr) {
    await logAdminError(authErr, { route: "/api/admin/inventory/losses", stage: "auth" });
    return applyRateLimitHeaders(NextResponse.json({ error: authErr.message }, { status: 401 }), rl);
  }
  if (!user) {
    await logAdminError("Not authenticated", { route: "/api/admin/inventory/losses", stage: "auth" });
    return applyRateLimitHeaders(NextResponse.json({ error: "Not authenticated" }, { status: 401 }), rl);
  }

  const allowed = await hasAdminAccess({ userId: user.id, email: user.email });
  if (!allowed) {
    await logAdminError("Forbidden admin attempt", { route: "/api/admin/inventory/losses", actor: user.email });
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
    loss_type: z.string().trim().max(120),
    note: z.string().trim().max(500).optional(),
  });
  const parsed = schema.safeParse(body || {});
  if (!parsed.success) {
    await logAdminError("Validation failed", { route: "/api/admin/inventory/losses", issues: parsed.error.issues });
    return applyRateLimitHeaders(respondZodError(parsed.error), rl);
  }

  const variantId = Number(String(parsed.data.variant_id).trim());
  if (!Number.isSafeInteger(variantId) || variantId < 1) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Invalid variant id" }, { status: 400 }), rl);
  }

  const quantity = Number(parsed.data.quantity);
  const lossType = normalizeInventoryLossType(parsed.data.loss_type);
  if (!isInventoryLossType(parsed.data.loss_type)) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: `Unsupported inventory loss type: ${parsed.data.loss_type}` }, { status: 400 }),
      rl
    );
  }

  const note = parsed.data.note || null;
  const admin = getSupabaseAdminClient();
  const { data: rpcData, error: rpcErr } = await admin.rpc("record_inventory_loss_atomic", {
    variant_id_input: variantId,
    loss_quantity_input: quantity,
    loss_type_input: lossType,
    note_input: note,
    occurred_at_input: new Date().toISOString(),
    recorded_by_user_id_input: user.id,
    recorded_by_email_input: user.email || null,
  });

  if (rpcErr) {
    await logAdminError(rpcErr, {
      route: "/api/admin/inventory/losses",
      actor: user.email,
      variant_id: variantId,
      quantity,
      loss_type: lossType,
      note,
      stage: "rpc:record_inventory_loss_atomic",
    });

    const message = String(rpcErr.message || "");
    if (isMissingInventoryLossRpcError(message) || isMissingInventoryLossSchemaError(message)) {
      return applyRateLimitHeaders(
        NextResponse.json(
          {
            error: "Inventory loss tracking is unavailable until the inventory loss migration is applied.",
          },
          { status: 409 }
        ),
        rl
      );
    }
    if (/variant not found/i.test(message)) {
      return applyRateLimitHeaders(NextResponse.json({ error: "Variant not found" }, { status: 404 }), rl);
    }
    if (/insufficient stock/i.test(message)) {
      return applyRateLimitHeaders(
        NextResponse.json({ error: "Not enough stock to record this loss quantity." }, { status: 409 }),
        rl
      );
    }
    return applyRateLimitHeaders(NextResponse.json({ error: message || "Inventory loss save failed" }, { status: 400 }), rl);
  }

  const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  if (!row || typeof row !== "object") {
    await logAdminError("Inventory loss RPC returned empty response", {
      route: "/api/admin/inventory/losses",
      actor: user.email,
      variant_id: variantId,
      quantity,
      loss_type: lossType,
      stage: "rpc:empty-response",
    });
    return applyRateLimitHeaders(
      NextResponse.json({ error: "Inventory loss recorded, but the response was empty." }, { status: 500 }),
      rl
    );
  }

  await logAdminEvent({
    route: "/api/admin/inventory/losses",
    actor: user.email,
    variant_id: variantId,
    product_id: row.product_id ?? null,
    movement_id: row.movement_id ?? null,
    loss_event_id: row.loss_event_id ?? null,
    movement_reason: getInventoryLossMovementReason(lossType),
    loss_type: lossType,
    before_stock: row.before_stock,
    quantity_lost: quantity,
    after_stock: row.after_stock,
    note: note || undefined,
    ok: true,
  });

  revalidatePublicCatalog();

  return applyRateLimitHeaders(
    NextResponse.json({
      ok: true,
      loss: {
        id: row.loss_event_id ?? null,
        variant_id: row.variant_id ?? variantId,
        product_id: row.product_id ?? null,
        movement_id: row.movement_id ?? null,
        loss_type: row.loss_type || lossType,
        quantity_lost: row.quantity_lost ?? quantity,
        before_stock: row.before_stock,
        after_stock: row.after_stock,
        occurred_at: row.occurred_at || new Date().toISOString(),
      },
    }),
    rl
  );
}
