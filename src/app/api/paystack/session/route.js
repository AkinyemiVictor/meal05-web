import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { checkRateLimit, applyRateLimitHeaders } from "@/lib/api/rate-limit";
import { getOriginTrustContext } from "@/lib/api/request-origin";
import { withNoStore } from "@/lib/api/no-store";
import { issuePaystackReference } from "@/lib/payments/paystack-reference";
import {
  initialisePaystackTransaction,
  resolvePaystackCustomerEmail,
  resolvePaystackSecret,
  toPaystackSubunit,
} from "@/lib/payments/paystack";
import { PAYMENT_METHOD_DISABLED, requireUsableProvider } from "@/lib/payments/provider-settings";
import { validateAvailabilityPaymentWindow } from "@/lib/availability-payment-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const payloadSchema = z.object({
  orderId: z.union([z.string(), z.number()]),
  returnUrl: z.string().trim().max(500).optional(),
});

const errorJson = (message, status, rl) =>
  applyRateLimitHeaders(withNoStore(NextResponse.json({ error: message }, { status })), rl);

export async function POST(request) {
  let rl = await checkRateLimit({ request, id: "paystack:session:ip", limit: 60, windowMs: 60_000 });
  if (!rl.allowed) return errorJson("Too many requests", 429, rl);

  const admin = getSupabaseAdminClient();
  const originTrust = await getOriginTrustContext(request, admin);
  if (!originTrust.trusted) return errorJson("Forbidden origin", 403, rl);

  const auth = getSupabaseRouteClient(await cookies());
  const { data: { user: cookieUser }, error: authErr } = await auth.auth.getUser();
  let user = originTrust.bearerUser || cookieUser || null;
  if (authErr && !user) return errorJson(authErr.message, 401, rl);
  if (!user) return errorJson("Not authenticated", 401, rl);

  const userRl = await checkRateLimit({
    request,
    id: `paystack:session:user:${user.id}`,
    limit: 20,
    windowMs: 60_000,
  });
  if (!userRl.allowed) return errorJson("Too many requests", 429, userRl);
  rl = userRl;

  try {
    await requireUsableProvider(admin, "paystack", "checkout");
  } catch {
    return applyRateLimitHeaders(
      withNoStore(NextResponse.json(PAYMENT_METHOD_DISABLED, { status: 503 })),
      rl
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return errorJson("Invalid JSON payload", 400, rl);
  }

  const parsed = payloadSchema.safeParse(body || {});
  if (!parsed.success) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 }),
      rl
    );
  }

  const orderId = String(parsed.data.orderId).trim();
  if (!orderId) return errorJson("Missing orderId", 400, rl);

  const { data: order, error: orderErr } = await admin
    .from("orders")
    .select("id, total, currency_code, user_id, payment_status, status, availability_request_id")
    .eq("id", orderId)
    .maybeSingle();
  if (orderErr) return errorJson(orderErr.message || "Unable to load order", 500, rl);
  if (!order) return errorJson("Order not found", 404, rl);
  if (String(order.user_id || "") !== String(user.id || "")) return errorJson("Forbidden", 403, rl);
  const availabilityPayment = await validateAvailabilityPaymentWindow(admin, order);
  if (!availabilityPayment.ok) return errorJson(availabilityPayment.error, availabilityPayment.status, rl);

  const paymentStatus = String(order.payment_status || "").toLowerCase();
  if (paymentStatus === "paid") return errorJson("Order is already paid", 409, rl);

  const amountKobo = toPaystackSubunit(order.total);
  if (amountKobo <= 0) return errorJson("Order total must be greater than zero", 400, rl);
  const secret = resolvePaystackSecret();
  if (!secret) return errorJson("Payment initialization is unavailable.", 503, rl);

  const currency = String(order.currency_code || "NGN").trim().toUpperCase();
  const email = resolvePaystackCustomerEmail(user);
  const fallbackCallbackUrl = new URL(
    `/api/paystack/verify?orderId=${encodeURIComponent(String(order.id))}`,
    request.url
  ).toString();
  const requestedReturnUrl = String(parsed.data.returnUrl || "").trim();
  const callbackUrl =
    /^meal05:\/\//i.test(requestedReturnUrl) || /^https:\/\/(www\.)?meal05\.com\//i.test(requestedReturnUrl)
      ? requestedReturnUrl
      : fallbackCallbackUrl;
  const issued = await issuePaystackReference({
    orderId: order.id,
    userId: user.id,
    email,
    amountKobo,
  });

  let initialized;
  try {
    initialized = await initialisePaystackTransaction({
      secret,
      email,
      amountKobo,
      reference: issued.reference,
      currency,
      callbackUrl,
      metadata: {
        orderId: String(order.id),
        userId: String(user.id),
        source: "meal05-mobile",
      },
    });
  } catch (error) {
    return errorJson(error?.message || "Unable to initialize Paystack payment.", 502, rl);
  }

  return applyRateLimitHeaders(
    withNoStore(NextResponse.json(
      {
        reference: issued.reference,
        orderId: String(order.id),
        amountKobo,
        amount: Number(order.total) || 0,
        currency,
        email,
        authorizationUrl: initialized.authorization_url,
        accessCode: initialized.access_code || "",
        expiresAt: issued.expiresAt,
      },
      { status: 200 }
    )),
    rl
  );
}
