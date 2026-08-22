import "server-only";

import crypto from "crypto";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { buildWhatsappUrl, normalizePhoneContact } from "../phone-links.js";

const TOKEN_BYTES = 32;
const DEFAULT_TOKEN_HOURS = 48;
const MAX_OTP_ATTEMPTS = 5;
const OTP_TTL_HOURS = 72;
const MAX_PROOF_PHOTO_BYTES = 1_200_000;
const MAX_PROOF_PHOTO_DIMENSION = 2000;

export const DELIVERY_ROUTE_STATUSES = new Set(["draft", "ready", "assigned", "accepted", "in_progress", "completed", "cancelled", "failed"]);
export const DELIVERY_STOP_STATUSES = new Set(["pending", "next", "en_route", "arrived", "delivered", "failed", "returned", "skipped"]);
export const DELIVERY_VEHICLE_TYPES = new Set(["motorcycle", "napep", "korope", "car", "van", "other"]);
export const DELIVERY_RECIPIENT_TYPES = new Set(["customer", "family_member", "security", "staff", "other"]);
export const DELIVERY_FAILURE_REASONS = new Set([
  "customer_unavailable",
  "wrong_address",
  "customer_refused",
  "vehicle_issue",
  "package_damaged",
  "unsafe_location",
  "unable_to_contact_customer",
  "other",
]);

const getSecret = () =>
  process.env.DELIVERY_SECURITY_SECRET ||
  process.env.NEXTAUTH_SECRET ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "meal05-delivery-development-secret";

export const hashToken = (token) => crypto.createHash("sha256").update(String(token || "")).digest("hex");

export const hashShortSecret = (value, scope = "delivery") =>
  crypto.createHmac("sha256", getSecret()).update(`${scope}:${String(value || "").trim()}`).digest("hex");

export const timingSafeEqualHex = (left, right) => {
  const a = Buffer.from(String(left || ""), "hex");
  const b = Buffer.from(String(right || ""), "hex");
  if (a.length !== b.length || !a.length) return false;
  return crypto.timingSafeEqual(a, b);
};

export const generateSecureToken = () => crypto.randomBytes(TOKEN_BYTES).toString("base64url");
export const generatePin = () => String(crypto.randomInt(0, 10_000)).padStart(4, "0");
export const generateOtp = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");

const toInt = (value) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

export const getGoogleMapsUrl = (stop) => {
  const lat = Number(stop?.delivery_latitude);
  const lng = Number(stop?.delivery_longitude);
  const destination = Number.isFinite(lat) && Number.isFinite(lng) ? `${lat},${lng}` : encodeURIComponent(stop?.delivery_address || "");
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
};

export const getWhatsAppUrl = (stop) => {
  const phone = normalizePhoneContact(stop?.customer_phone);
  const reference = stop?.orders?.order_reference || stop?.order_reference || stop?.order_id || "your Meal05 order";
  const message = `Hello, I am the Meal05 delivery partner handling order ${reference}. I am currently heading toward your delivery location.`;
  return phone ? buildWhatsappUrl(phone.whatsappNumber, message) : "";
};

export const getCallUrl = (stop) => {
  const phone = normalizePhoneContact(stop?.customer_phone);
  return phone?.callUrl || "";
};

export async function logDeliveryAudit(admin, payload = {}) {
  const client = admin || getSupabaseAdminClient();
  const row = {
    route_id: payload.routeId || payload.route_id || null,
    route_stop_id: payload.routeStopId || payload.route_stop_id || null,
    order_id: payload.orderId || payload.order_id || null,
    actor_user_id: payload.actorUserId || payload.actor_user_id || null,
    actor_type: payload.actorType || payload.actor_type || "system",
    action: payload.action || "delivery_event",
    old_value: payload.oldValue || payload.old_value || null,
    new_value: payload.newValue || payload.new_value || null,
    reason: payload.reason || null,
    ip_address: payload.ipAddress || payload.ip_address || null,
    user_agent: payload.userAgent || payload.user_agent || null,
  };
  const { error } = await client.from("delivery_audit_logs").insert(row);
  if (error) console.warn("Unable to persist delivery audit log", error);
}

export async function loadDispatchDashboard() {
  const admin = getSupabaseAdminClient();
  const [ordersRes, partnersRes, routesRes] = await Promise.all([
    admin
      .from("orders")
      .select("id, order_reference, user_id, total, delivery_fee, delivery_status, payment_status, status, delivery_address, delivery_contact_name, delivery_contact_phone, delivery_landmark, created_at")
      .in("delivery_status", ["ready_for_dispatch", "awaiting dispatch"])
      .neq("fulfillment_type", "pickup")
      .order("created_at", { ascending: true })
      .limit(80),
    admin
      .from("delivery_partners")
      .select("id, full_name, name, phone, contact_phone, vehicle_type, vehicle_plate_number, operating_area, is_active, is_verified, status")
      .or("is_active.eq.true,status.eq.active")
      .order("created_at", { ascending: false })
      .limit(80),
    admin
      .from("delivery_routes")
      .select("id, route_code, status, vehicle_type, planned_start_time, actual_start_time, completed_at, pickup_location, agreed_partner_payment, delivery_fees_collected, delivery_margin, created_at, delivery_partners(full_name,name,phone,vehicle_type)")
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  return {
    orders: ordersRes.data || [],
    partners: (partnersRes.data || []).filter((partner) => Boolean(normalizePhoneContact(partner.phone || partner.contact_phone))),
    routes: routesRes.data || [],
    warnings: [ordersRes.error?.message, partnersRes.error?.message, routesRes.error?.message].filter(Boolean),
  };
}

export async function createDeliveryRoute({
  actorUserId,
  orderIds,
  deliveryPartnerId,
  vehicleType,
  plannedStartTime,
  pickupLocation,
  agreedPartnerPayment,
  otherDeliveryCost,
  packages,
  notes,
  ipAddress,
  userAgent,
} = {}) {
  const admin = getSupabaseAdminClient();
  const ids = (Array.isArray(orderIds) ? orderIds : []).map(toInt);
  if (!ids.length) throw new Error("Select at least one order.");
  if (ids.some((id) => !id)) throw new Error("Order IDs must be valid positive numbers.");
  if (ids.length > 30) throw new Error("A route can contain at most 30 stops in this version.");
  if (!deliveryPartnerId) throw new Error("Select an active delivery partner.");
  if (vehicleType && !DELIVERY_VEHICLE_TYPES.has(vehicleType)) throw new Error("Unsupported vehicle type.");

  const packageRows = (Array.isArray(packages) ? packages : []).map((entry) => ({
    orderId: toInt(entry?.orderId),
    packageCount: Number(entry?.packageCount),
  }));
  if (packageRows.some((entry) => !entry.orderId || !ids.includes(entry.orderId))) throw new Error("Package details must match the selected orders.");
  if (packageRows.some((entry) => !Number.isInteger(entry.packageCount) || entry.packageCount < 1 || entry.packageCount > 50)) {
    throw new Error("Each package count must be between 1 and 50.");
  }

  const { data, error } = await admin.rpc("create_delivery_route_with_packages_transaction", {
    p_actor_user_id: actorUserId,
    p_order_ids: ids,
    p_delivery_partner_id: deliveryPartnerId || null,
    p_vehicle_type: vehicleType || null,
    p_planned_start_time: plannedStartTime || null,
    p_pickup_location: pickupLocation || null,
    p_agreed_partner_payment: agreedPartnerPayment == null || agreedPartnerPayment === "" ? null : Number(agreedPartnerPayment),
    p_other_delivery_cost: Number(otherDeliveryCost) || 0,
    p_notes: notes || null,
    p_hash_secret: getSecret(),
    p_token_expires_hours: DEFAULT_TOKEN_HOURS,
    p_require_pin: true,
    p_ip_address: ipAddress || null,
    p_user_agent: userAgent || null,
    p_packages: packageRows,
  });
  if (error) throw new Error(error.message);

  return data || {};
}

export async function generateDeliveryAccessToken({ routeId, actorUserId, expiresInHours = DEFAULT_TOKEN_HOURS, requirePin = true, ipAddress, userAgent } = {}) {
  const admin = getSupabaseAdminClient();
  const { data: route, error: routeError } = await admin
    .from("delivery_routes")
    .select("id, route_code, delivery_partner_id, status")
    .eq("id", routeId)
    .maybeSingle();
  if (routeError) throw new Error(routeError.message);
  if (!route) throw new Error("Route not found.");
  if (!route.delivery_partner_id) throw new Error("Assign a delivery partner before generating a rider link.");

  const token = generateSecureToken();
  const pin = requirePin ? generatePin() : "";
  const expiresAt = new Date(Date.now() + Number(expiresInHours || DEFAULT_TOKEN_HOURS) * 60 * 60 * 1000).toISOString();

  await admin.from("delivery_access_tokens").update({ revoked_at: new Date().toISOString() }).eq("route_id", route.id).is("revoked_at", null);

  const { data: access, error } = await admin
    .from("delivery_access_tokens")
    .insert({
      route_id: route.id,
      delivery_partner_id: route.delivery_partner_id,
      token_hash: hashToken(token),
      pin_hash: pin ? hashShortSecret(pin, `rider-pin:${route.id}`) : null,
      expires_at: expiresAt,
    })
    .select("id, route_id, expires_at")
    .single();
  if (error) throw new Error(error.message);

  await logDeliveryAudit(admin, {
    routeId: route.id,
    actorUserId,
    actorType: "dispatcher",
    action: "token_generated",
    newValue: { tokenId: access.id, expiresAt },
    ipAddress,
    userAgent,
  });

  return { token, pin, expiresAt, routeCode: route.route_code };
}

export async function revokeDeliveryAccessTokens({ routeId, actorUserId, reason, ipAddress, userAgent } = {}) {
  const admin = getSupabaseAdminClient();
  const revokedAt = new Date().toISOString();
  const { data, error } = await admin
    .from("delivery_access_tokens")
    .update({ revoked_at: revokedAt })
    .eq("route_id", routeId)
    .is("revoked_at", null)
    .select("id, route_id");
  if (error) throw new Error(error.message);
  await logDeliveryAudit(admin, {
    routeId,
    actorUserId,
    actorType: "dispatcher",
    action: "token_revoked",
    newValue: { revokedCount: data?.length || 0, revokedAt },
    reason,
    ipAddress,
    userAgent,
  });
  return { revokedCount: data?.length || 0 };
}

const routeSelect = `
  id, route_code, status, vehicle_type, planned_start_time, actual_start_time, completed_at, pickup_location,
  agreed_partner_payment, delivery_fees_collected, delivery_margin, notes,
  delivery_partners(id, rider_code, full_name, name, phone, contact_phone, photo_path, vehicle_type, vehicle_plate_number, is_active),
  delivery_route_stops(
    id, route_id, order_id, stop_number, customer_name, customer_phone, delivery_address, delivery_landmark,
    delivery_latitude, delivery_longitude, delivery_window_start, delivery_window_end, status, arrived_at,
    delivered_at, failed_at, failure_reason, recipient_type, recipient_name, otp_verified_at, proof_photo_path,
    delivery_notes, package_count, orders(order_reference)
  )
`;

export async function loadRiderRouteByToken(token, { pin, touch = true } = {}) {
  const admin = getSupabaseAdminClient();
  const tokenHash = hashToken(token);
  const { data: access, error } = await admin
    .from("delivery_access_tokens")
    .select("id, route_id, delivery_partner_id, pin_hash, expires_at, revoked_at, accepted_at, delivery_routes(" + routeSelect + ")")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!access) throw new Error("Invalid rider link.");
  if (access.revoked_at) throw new Error("This rider link has been revoked.");
  if (new Date(access.expires_at).getTime() <= Date.now()) throw new Error("This rider link has expired.");
  const route = access.delivery_routes;
  if (!route || ["completed", "cancelled", "failed"].includes(route.status)) throw new Error("This route is no longer active.");
  if (access.pin_hash) {
    if (!pin) return { requiresPin: true, route: null, access: { id: access.id } };
    const expected = hashShortSecret(pin, `rider-pin:${access.route_id}`);
    if (!timingSafeEqualHex(expected, access.pin_hash)) throw new Error("Invalid rider PIN.");
  }
  if (touch) {
    await admin.from("delivery_access_tokens").update({ last_accessed_at: new Date().toISOString() }).eq("id", access.id);
  }
  const stops = Array.isArray(route.delivery_route_stops)
    ? route.delivery_route_stops.slice().sort((a, b) => Number(a.stop_number) - Number(b.stop_number))
    : [];
  return { requiresPin: false, access, route: { ...route, delivery_route_stops: stops } };
}

export async function updateRouteStatusByToken({ token, pin, status, actorType = "rider", ipAddress, userAgent } = {}) {
  if (!DELIVERY_ROUTE_STATUSES.has(status)) throw new Error("Unsupported route status.");
  const admin = getSupabaseAdminClient();
  const loaded = await loadRiderRouteByToken(token, { pin });
  if (loaded.requiresPin) return loaded;
  const route = loaded.route;
  const patch = { status };
  if (status === "accepted") patch.actual_start_time = route.actual_start_time || null;
  if (status === "in_progress") patch.actual_start_time = new Date().toISOString();
  if (status === "completed") patch.completed_at = new Date().toISOString();
  const { data, error } = await admin.from("delivery_routes").update(patch).eq("id", route.id).select("*").single();
  if (error) throw new Error(error.message);
  await logDeliveryAudit(admin, { routeId: route.id, actorType, action: `route_${status}`, oldValue: { status: route.status }, newValue: patch, ipAddress, userAgent });
  return { route: data };
}

export async function updateStopStatusByToken({ token, pin, stopId, status, failureReason, notes, ipAddress, userAgent } = {}) {
  if (!DELIVERY_STOP_STATUSES.has(status)) throw new Error("Unsupported stop status.");
  if (failureReason && !DELIVERY_FAILURE_REASONS.has(failureReason)) throw new Error("Unsupported failure reason.");
  const admin = getSupabaseAdminClient();
  const loaded = await loadRiderRouteByToken(token, { pin });
  if (loaded.requiresPin) return loaded;
  const stop = loaded.route.delivery_route_stops.find((entry) => entry.id === stopId);
  if (!stop) throw new Error("Stop not found for this route.");
  const now = new Date().toISOString();
  const patch = { status, delivery_notes: notes || stop.delivery_notes || null };
  if (status === "arrived") patch.arrived_at = now;
  if (status === "en_route") patch.status = "en_route";
  if (["failed", "returned"].includes(status)) {
    patch.failed_at = now;
    patch.failure_reason = failureReason || "other";
  }
  const { data, error } = await admin.from("delivery_route_stops").update(patch).eq("id", stop.id).select("*").single();
  if (error) throw new Error(error.message);
  const orderDeliveryStatus = status === "en_route" ? "out_for_delivery" : status === "arrived" ? "rider_approaching" : status === "failed" ? "delivery_attempt_failed" : null;
  if (orderDeliveryStatus) await admin.from("orders").update({ delivery_status: orderDeliveryStatus }).eq("id", stop.order_id);
  await logDeliveryAudit(admin, { routeId: loaded.route.id, routeStopId: stop.id, orderId: stop.order_id, actorType: "rider", action: "stop_status_changed", oldValue: stop, newValue: patch, reason: failureReason || null, ipAddress, userAgent });
  return { stop: data };
}

export async function verifyStopOtpByToken({ token, pin, stopId, otp, recipientType, recipientName, deliveryNotes, ipAddress, userAgent } = {}) {
  const admin = getSupabaseAdminClient();
  const loaded = await loadRiderRouteByToken(token, { pin });
  if (loaded.requiresPin) return loaded;
  const stop = loaded.route.delivery_route_stops.find((entry) => entry.id === stopId);
  if (!stop) throw new Error("Stop not found for this route.");

  const { data: fullStop, error: stopError } = await admin
    .from("delivery_route_stops")
    .select("*")
    .eq("id", stop.id)
    .maybeSingle();
  if (stopError) throw new Error(stopError.message);
  if (!fullStop) throw new Error("Stop not found.");
  if (fullStop.status === "delivered") throw new Error("This stop is already delivered.");
  if (Number(fullStop.otp_attempt_count || 0) >= MAX_OTP_ATTEMPTS) throw new Error("OTP attempt limit reached. Contact dispatch.");
  if (fullStop.otp_expires_at && new Date(fullStop.otp_expires_at).getTime() <= Date.now()) throw new Error("This OTP has expired.");
  const expected = hashShortSecret(otp, `delivery-otp:${loaded.route.id}:${fullStop.order_id}`);
  if (!otp || !timingSafeEqualHex(expected, fullStop.delivery_otp_hash)) {
    await admin.from("delivery_route_stops").update({ otp_attempt_count: Number(fullStop.otp_attempt_count || 0) + 1 }).eq("id", fullStop.id);
    await logDeliveryAudit(admin, { routeId: loaded.route.id, routeStopId: fullStop.id, orderId: fullStop.order_id, actorType: "rider", action: "otp_failed", reason: "invalid_otp", ipAddress, userAgent });
    throw new Error("Invalid OTP.");
  }
  if (recipientType && !DELIVERY_RECIPIENT_TYPES.has(recipientType)) throw new Error("Unsupported recipient type.");
  const now = new Date().toISOString();
  const patch = {
    status: "delivered",
    delivered_at: now,
    otp_verified_at: now,
    recipient_type: recipientType || "customer",
    recipient_name: recipientName || fullStop.customer_name,
    delivery_notes: deliveryNotes || fullStop.delivery_notes || null,
  };
  const { data: deliveredStop, error } = await admin.from("delivery_route_stops").update(patch).eq("id", fullStop.id).select("*").single();
  if (error) throw new Error(error.message);
  await admin.from("orders").update({ delivery_status: "delivered", status: "delivered" }).eq("id", fullStop.order_id);

  const remaining = loaded.route.delivery_route_stops.filter((entry) => entry.id !== fullStop.id && !["delivered", "failed", "returned", "skipped"].includes(entry.status));
  const nextStop = remaining.sort((a, b) => Number(a.stop_number) - Number(b.stop_number))[0];
  if (nextStop) {
    await admin.from("delivery_route_stops").update({ status: "next" }).eq("id", nextStop.id).in("status", ["pending", "en_route", "arrived"]);
  } else {
    await admin.from("delivery_routes").update({ status: "completed", completed_at: now }).eq("id", loaded.route.id);
    await admin.from("delivery_access_tokens").update({ revoked_at: now }).eq("route_id", loaded.route.id).is("revoked_at", null);
  }

  await logDeliveryAudit(admin, { routeId: loaded.route.id, routeStopId: fullStop.id, orderId: fullStop.order_id, actorType: "rider", action: "otp_verified", newValue: patch, ipAddress, userAgent });
  return { stop: deliveredStop, nextStopId: nextStop?.id || null };
}

const getProofImageMetadata = (buffer) => {
  if (buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { type: "image/png", ext: "png", width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    const chunk = buffer.toString("ascii", 12, 16);
    if (chunk === "VP8X" && buffer.length >= 30) {
      return { type: "image/webp", ext: "webp", width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
    }
    if (chunk === "VP8 " && buffer.length >= 30) {
      return { type: "image/webp", ext: "webp", width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
    }
    if (chunk === "VP8L" && buffer.length >= 25 && buffer[20] === 0x2f) {
      const bits = buffer.readUInt32LE(21);
      return { type: "image/webp", ext: "webp", width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
  }

  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if (length < 2) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { type: "image/jpeg", ext: "jpg", width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
      }
      offset += 2 + length;
    }
    return { type: "image/jpeg", ext: "jpg", width: null, height: null };
  }

  return null;
};

export async function attachProofPhotoByToken({ token, pin, stopId, file, ipAddress, userAgent } = {}) {
  const admin = getSupabaseAdminClient();
  const loaded = await loadRiderRouteByToken(token, { pin });
  if (loaded.requiresPin) return loaded;
  const stop = loaded.route.delivery_route_stops.find((entry) => entry.id === stopId);
  if (!stop) throw new Error("Stop not found for this route.");
  if (!file || typeof file.arrayBuffer !== "function") throw new Error("Proof photo is required.");
  const type = String(file.type || "");
  if (!["image/jpeg", "image/png", "image/webp"].includes(type)) throw new Error("Upload a JPG, PNG, or WebP image.");
  if (Number(file.size || 0) > MAX_PROOF_PHOTO_BYTES) throw new Error("Proof photo must be 1.2MB or less.");
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const metadata = getProofImageMetadata(buffer);
  if (!metadata || metadata.type !== type) throw new Error("Proof photo content does not match the file type.");
  if (metadata.width && metadata.height && Math.max(metadata.width, metadata.height) > MAX_PROOF_PHOTO_DIMENSION) {
    throw new Error("Proof photo dimensions are too large. Retake or choose a smaller image.");
  }
  const ext = metadata.ext;
  const path = `delivery-proof/${loaded.route.id}/${stop.id}/${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await admin.storage.from("delivery-proof-photos").upload(path, buffer, {
    contentType: type,
    upsert: false,
  });
  if (uploadError) throw new Error(uploadError.message);
  const { data, error } = await admin
    .from("delivery_route_stops")
    .update({ proof_photo_path: path })
    .eq("id", stop.id)
    .select("id, proof_photo_path")
    .single();
  if (error) throw new Error(error.message);
  await logDeliveryAudit(admin, {
    routeId: loaded.route.id,
    routeStopId: stop.id,
    orderId: stop.order_id,
    actorType: "rider",
    action: "proof_photo_uploaded",
    newValue: { proof_photo_path: path },
    ipAddress,
    userAgent,
  });
  return { proof: data };
}

export async function regenerateStopOtp({ stopId, actorUserId, reason, ipAddress, userAgent } = {}) {
  if (!reason || String(reason).trim().length < 3) throw new Error("OTP regeneration requires a reason.");
  const admin = getSupabaseAdminClient();
  const { data: stop, error: stopError } = await admin
    .from("delivery_route_stops")
    .select("id, route_id, order_id, customer_id, status, orders(order_reference)")
    .eq("id", stopId)
    .maybeSingle();
  if (stopError) throw new Error(stopError.message);
  if (!stop) throw new Error("Stop not found.");
  if (["delivered", "returned", "skipped"].includes(stop.status)) throw new Error("Cannot regenerate OTP for a closed stop.");
  const otp = generateOtp();
  const patch = {
    delivery_otp_hash: hashShortSecret(otp, `delivery-otp:${stop.route_id}:${stop.order_id}`),
    otp_expires_at: new Date(Date.now() + OTP_TTL_HOURS * 60 * 60 * 1000).toISOString(),
    otp_attempt_count: 0,
    otp_verified_at: null,
  };
  const { data, error } = await admin.from("delivery_route_stops").update(patch).eq("id", stop.id).select("id, route_id, order_id").single();
  if (error) throw new Error(error.message);
  await logDeliveryAudit(admin, {
    routeId: stop.route_id,
    routeStopId: stop.id,
    orderId: stop.order_id,
    actorUserId,
    actorType: "dispatcher",
    action: "otp_regenerated",
    reason,
    newValue: { otp_expires_at: patch.otp_expires_at },
    ipAddress,
    userAgent,
  });
  return {
    stop: data,
    customerOtpMessage: {
      orderId: stop.order_id,
      orderReference: stop.orders?.order_reference || String(stop.order_id),
      customerId: stop.customer_id,
      otp,
      message: `Meal05 delivery OTP for order ${stop.orders?.order_reference || stop.order_id}: ${otp}. Do not share it until your order is with you.`,
    },
  };
}

export async function manuallyConfirmStop({ stopId, actorUserId, reason, recipientType, recipientName, deliveryNotes, ipAddress, userAgent } = {}) {
  if (!reason || String(reason).trim().length < 5) throw new Error("Manual delivery override requires a reason.");
  if (recipientType && !DELIVERY_RECIPIENT_TYPES.has(recipientType)) throw new Error("Unsupported recipient type.");
  const admin = getSupabaseAdminClient();
  const { data: stop, error: stopError } = await admin
    .from("delivery_route_stops")
    .select("*")
    .eq("id", stopId)
    .maybeSingle();
  if (stopError) throw new Error(stopError.message);
  if (!stop) throw new Error("Stop not found.");
  if (stop.status === "delivered") throw new Error("This stop is already delivered.");
  const now = new Date().toISOString();
  const patch = {
    status: "delivered",
    delivered_at: now,
    recipient_type: recipientType || "other",
    recipient_name: recipientName || stop.customer_name,
    delivery_notes: deliveryNotes || stop.delivery_notes || null,
  };
  const { data, error } = await admin.from("delivery_route_stops").update(patch).eq("id", stop.id).select("*").single();
  if (error) throw new Error(error.message);
  await admin.from("orders").update({ delivery_status: "delivered", status: "delivered" }).eq("id", stop.order_id);
  await logDeliveryAudit(admin, {
    routeId: stop.route_id,
    routeStopId: stop.id,
    orderId: stop.order_id,
    actorUserId,
    actorType: "dispatcher",
    action: "delivery_manually_overridden",
    oldValue: { status: stop.status },
    newValue: patch,
    reason,
    ipAddress,
    userAgent,
  });
  return { stop: data };
}

export async function loadCustomerDelivery(orderId, userId) {
  const id = toInt(orderId);
  if (!id || !userId) throw new Error("Order not found.");
  const admin = getSupabaseAdminClient();
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, order_reference, user_id, status, payment_status, delivery_status, delivery_date, delivery_fee, delivery_address")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (orderError) throw new Error(orderError.message);
  if (!order) throw new Error("Order not found.");
  const { data: stop, error: stopError } = await admin
    .from("delivery_route_stops")
    .select("id, route_id, stop_number, status, delivery_window_start, delivery_window_end, arrived_at, delivered_at, recipient_name, otp_verified_at, delivery_routes(route_code,status,vehicle_type,delivery_partners(rider_code,full_name,name,vehicle_type,vehicle_plate_number))")
    .eq("order_id", id)
    .maybeSingle();
  if (stopError) throw new Error(stopError.message);
  return { order, delivery: stop || null };
}
