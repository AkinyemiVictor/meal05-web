import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasAdminAccess } from "@/lib/admin-access";
import { checkRateLimit, applyRateLimitHeaders } from "@/lib/api/rate-limit";
import { logAdminEvent, logAdminError } from "@/lib/api/log";
import { respondZodError } from "@/lib/api/validate";
import {
  isPlanningDate,
  normalizePlanningDate,
  normalizePurchaseCost,
  normalizeRestockLeadTimeDays,
  normalizeSupplierName,
} from "@/lib/supplier-restock-planning";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isMissingSupplierRestockPlanningSchemaError = (message) =>
  /relation .*suppliers.* does not exist|column .*supplier_id.* does not exist|column .*purchase_cost.* does not exist|column .*restock_lead_time_days.* does not exist|column .*last_restock_date.* does not exist|column .*expected_restock_date.* does not exist|column .*name_key.* does not exist|schema cache/i.test(
    String(message || "")
  );

const parseVariantId = (value) => {
  const numeric = Number(String(value || "").trim());
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
};

const normalizeOptionalText = (value, maxLength) => String(value ?? "").trim().slice(0, maxLength);

const loadOrCreateSupplier = async (admin, supplierName) => {
  const normalizedName = normalizeSupplierName(supplierName);
  if (!normalizedName) return { supplier: null, error: null };

  const supplierKey = normalizedName.toLowerCase();
  const existingRes = await admin
    .from("suppliers")
    .select("id, name, is_active")
    .eq("name_key", supplierKey)
    .maybeSingle();

  if (existingRes.error) {
    return { supplier: null, error: existingRes.error };
  }

  if (existingRes.data) {
    const updateRes = await admin
      .from("suppliers")
      .update({ name: normalizedName, is_active: true })
      .eq("id", existingRes.data.id)
      .select("id, name, is_active")
      .maybeSingle();
    return { supplier: updateRes.data || existingRes.data, error: updateRes.error };
  }

  const insertRes = await admin
    .from("suppliers")
    .insert({ name: normalizedName, is_active: true })
    .select("id, name, is_active")
    .maybeSingle();

  if (!insertRes.error) {
    return { supplier: insertRes.data || null, error: null };
  }

  if (String(insertRes.error.code || "") === "23505") {
    const retryRes = await admin
      .from("suppliers")
      .select("id, name, is_active")
      .eq("name_key", supplierKey)
      .maybeSingle();
    return { supplier: retryRes.data || null, error: retryRes.error };
  }

  return { supplier: null, error: insertRes.error };
};

export async function POST(req) {
  const rl = await checkRateLimit({
    request: req,
    id: "admin:inventory:restock-planning:save",
    limit: 60,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Too many requests" }, { status: 429 }), rl);
  }

  const auth = getSupabaseRouteClient(await cookies());
  const {
    data: { user },
    error: authErr,
  } = await auth.auth.getUser();
  if (authErr) {
    await logAdminError(authErr, { route: "/api/admin/inventory/restock-planning/save", stage: "auth" });
    return applyRateLimitHeaders(NextResponse.json({ error: authErr.message }, { status: 401 }), rl);
  }
  if (!user) {
    await logAdminError("Not authenticated", { route: "/api/admin/inventory/restock-planning/save", stage: "auth" });
    return applyRateLimitHeaders(NextResponse.json({ error: "Not authenticated" }, { status: 401 }), rl);
  }

  const allowed = await hasAdminAccess({ userId: user.id, email: user.email });
  if (!allowed) {
    await logAdminError("Forbidden admin attempt", {
      route: "/api/admin/inventory/restock-planning/save",
      actor: user.email,
    });
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
    supplier_name: z.string().trim().max(160).optional(),
    purchase_cost: z.union([z.string(), z.number(), z.null()]).optional(),
    lead_time_days: z.union([z.string(), z.number(), z.null()]).optional(),
    last_restock_date: z.union([z.string().trim().max(40), z.null()]).optional(),
    expected_restock_date: z.union([z.string().trim().max(40), z.null()]).optional(),
  });
  const parsed = schema.safeParse(body || {});
  if (!parsed.success) {
    await logAdminError("Validation failed", {
      route: "/api/admin/inventory/restock-planning/save",
      issues: parsed.error.issues,
    });
    return applyRateLimitHeaders(respondZodError(parsed.error), rl);
  }

  const variantId = parseVariantId(parsed.data.variant_id);
  if (variantId == null) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Invalid variant id" }, { status: 400 }), rl);
  }

  const supplierName = normalizeSupplierName(parsed.data.supplier_name);

  const purchaseCostRaw = normalizeOptionalText(parsed.data.purchase_cost, 40);
  const purchaseCost = normalizePurchaseCost(parsed.data.purchase_cost);
  if (purchaseCostRaw && purchaseCost == null) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: "Purchase cost must be zero or greater." }, { status: 400 }),
      rl
    );
  }

  const leadTimeRaw = normalizeOptionalText(parsed.data.lead_time_days, 40);
  const leadTimeDays = normalizeRestockLeadTimeDays(parsed.data.lead_time_days);
  if (leadTimeRaw && leadTimeDays == null) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: "Lead time must be a whole number between 0 and 365." }, { status: 400 }),
      rl
    );
  }

  const lastRestockRaw = normalizeOptionalText(parsed.data.last_restock_date, 40);
  const lastRestockDate = normalizePlanningDate(parsed.data.last_restock_date);
  if (lastRestockRaw && (!lastRestockDate || !isPlanningDate(lastRestockDate))) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: "Last restock date must be a valid YYYY-MM-DD value." }, { status: 400 }),
      rl
    );
  }

  const expectedRestockRaw = normalizeOptionalText(parsed.data.expected_restock_date, 40);
  const expectedRestockDate = normalizePlanningDate(parsed.data.expected_restock_date);
  if (expectedRestockRaw && (!expectedRestockDate || !isPlanningDate(expectedRestockDate))) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: "Expected restock date must be a valid YYYY-MM-DD value." }, { status: 400 }),
      rl
    );
  }

  if (lastRestockDate && expectedRestockDate && expectedRestockDate < lastRestockDate) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: "Expected restock date cannot be earlier than the last restock date." }, { status: 400 }),
      rl
    );
  }

  const admin = getSupabaseAdminClient();
  const currentRes = await admin
    .from("product_variants")
    .select("id, product_id, supplier_id, purchase_cost, restock_lead_time_days, last_restock_date, expected_restock_date")
    .eq("id", variantId)
    .maybeSingle();

  if (currentRes.error) {
    await logAdminError(currentRes.error, {
      route: "/api/admin/inventory/restock-planning/save",
      actor: user.email,
      variant_id: variantId,
      stage: "load-variant",
    });
    if (isMissingSupplierRestockPlanningSchemaError(currentRes.error.message)) {
      return applyRateLimitHeaders(
        NextResponse.json(
          { error: "Supplier restock planning is unavailable until the supplier planning migration is applied." },
          { status: 409 }
        ),
        rl
      );
    }
    return applyRateLimitHeaders(NextResponse.json({ error: currentRes.error.message }, { status: 400 }), rl);
  }

  if (!currentRes.data) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Variant not found" }, { status: 404 }), rl);
  }

  const supplierResult = await loadOrCreateSupplier(admin, supplierName);
  if (supplierResult.error) {
    await logAdminError(supplierResult.error, {
      route: "/api/admin/inventory/restock-planning/save",
      actor: user.email,
      variant_id: variantId,
      supplier_name: supplierName || null,
      stage: "upsert-supplier",
    });
    if (isMissingSupplierRestockPlanningSchemaError(supplierResult.error.message)) {
      return applyRateLimitHeaders(
        NextResponse.json(
          { error: "Supplier restock planning is unavailable until the supplier planning migration is applied." },
          { status: 409 }
        ),
        rl
      );
    }
    return applyRateLimitHeaders(NextResponse.json({ error: supplierResult.error.message }, { status: 400 }), rl);
  }

  const supplier = supplierResult.supplier;
  const payload = {
    supplier_id: supplier?.id ?? null,
    purchase_cost: purchaseCost,
    restock_lead_time_days: leadTimeDays,
    last_restock_date: lastRestockDate || null,
    expected_restock_date: expectedRestockDate || null,
  };

  const updateRes = await admin
    .from("product_variants")
    .update(payload)
    .eq("id", variantId)
    .select("id, product_id, supplier_id, purchase_cost, restock_lead_time_days, last_restock_date, expected_restock_date")
    .maybeSingle();

  if (updateRes.error) {
    await logAdminError(updateRes.error, {
      route: "/api/admin/inventory/restock-planning/save",
      actor: user.email,
      variant_id: variantId,
      supplier_id: payload.supplier_id,
      stage: "update-variant",
    });
    if (isMissingSupplierRestockPlanningSchemaError(updateRes.error.message)) {
      return applyRateLimitHeaders(
        NextResponse.json(
          { error: "Supplier restock planning is unavailable until the supplier planning migration is applied." },
          { status: 409 }
        ),
        rl
      );
    }
    return applyRateLimitHeaders(NextResponse.json({ error: updateRes.error.message }, { status: 400 }), rl);
  }

  await logAdminEvent({
    route: "/api/admin/inventory/restock-planning/save",
    actor: user.email,
    variant_id: variantId,
    product_id: updateRes.data?.product_id ?? currentRes.data.product_id ?? null,
    before_supplier_id: currentRes.data.supplier_id ?? null,
    after_supplier_id: updateRes.data?.supplier_id ?? payload.supplier_id ?? null,
    before_purchase_cost: currentRes.data.purchase_cost,
    after_purchase_cost: updateRes.data?.purchase_cost ?? purchaseCost,
    before_lead_time_days: currentRes.data.restock_lead_time_days,
    after_lead_time_days: updateRes.data?.restock_lead_time_days ?? leadTimeDays,
    before_last_restock_date: currentRes.data.last_restock_date,
    after_last_restock_date: updateRes.data?.last_restock_date ?? (lastRestockDate || null),
    before_expected_restock_date: currentRes.data.expected_restock_date,
    after_expected_restock_date: updateRes.data?.expected_restock_date ?? (expectedRestockDate || null),
    ok: true,
  });

  return applyRateLimitHeaders(
    NextResponse.json({
      ok: true,
      planning: {
        variant_id: updateRes.data?.id ?? variantId,
        product_id: updateRes.data?.product_id ?? currentRes.data.product_id ?? null,
        supplier_id: updateRes.data?.supplier_id ?? payload.supplier_id ?? null,
        supplier_name: supplier?.name || "",
        purchase_cost: updateRes.data?.purchase_cost ?? purchaseCost,
        lead_time_days: updateRes.data?.restock_lead_time_days ?? leadTimeDays,
        last_restock_date: updateRes.data?.last_restock_date ?? (lastRestockDate || null),
        expected_restock_date: updateRes.data?.expected_restock_date ?? (expectedRestockDate || null),
      },
    }),
    rl
  );
}
