import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { normalizePhoneContact } from "@/lib/phone-links";

const RIDER_SELECT = "id, rider_code, full_name, name, phone, contact_phone, photo_path, vehicle_type, vehicle_plate_number, operating_area, is_active, status, created_at, updated_at";

const normalizeRider = (row, photoUrl = "") => ({
  id: row.id,
  riderCode: row.rider_code || "",
  fullName: row.full_name || row.name || "Meal05 rider",
  phone: row.phone || row.contact_phone || "",
  photoUrl,
  vehicleType: row.vehicle_type || "",
  vehicleNumber: row.vehicle_plate_number || "",
  operatingArea: row.operating_area || "",
  isActive: row.is_active !== false && row.status === "active",
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

async function signedPhotoUrl(admin, path) {
  if (!path) return "";
  const { data, error } = await admin.storage.from("rider-photos").createSignedUrl(path, 60 * 60);
  return error ? "" : data?.signedUrl || "";
}

export async function loadRiderDirectory({ activeOnly = false } = {}) {
  const admin = getSupabaseAdminClient();
  let query = admin.from("delivery_partners").select(RIDER_SELECT).order("created_at", { ascending: false }).limit(200);
  if (activeOnly) query = query.eq("is_active", true).eq("status", "active");
  const { data, error } = await query;
  if (error) return { riders: [], warning: error.message };

  let riders = await Promise.all(
    (data || []).map(async (row) => normalizeRider(row, await signedPhotoUrl(admin, row.photo_path)))
  );
  if (activeOnly) riders = riders.filter((rider) => Boolean(normalizePhoneContact(rider.phone)));
  return { riders, warning: "" };
}

export async function loadOrderDeliveryAssignment(orderId) {
  const id = Number(orderId);
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const admin = getSupabaseAdminClient();
  const { data: stop, error } = await admin
    .from("delivery_route_stops")
    .select(`
      id, order_id, route_id, stop_number, status, package_count,
      delivery_routes(
        id, route_code, status, actual_start_time, completed_at,
        delivery_partners(id, rider_code, full_name, name, phone, contact_phone, vehicle_type, vehicle_plate_number)
      )
    `)
    .eq("order_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !stop) return null;
  const route = Array.isArray(stop.delivery_routes) ? stop.delivery_routes[0] : stop.delivery_routes;
  const rider = Array.isArray(route?.delivery_partners) ? route.delivery_partners[0] : route?.delivery_partners;
  return {
    stopId: stop.id,
    stopStatus: stop.status,
    stopNumber: stop.stop_number,
    packageCount: stop.package_count || 1,
    routeId: route?.id || stop.route_id,
    routeCode: route?.route_code || "",
    routeStatus: route?.status || "",
    rider: rider
      ? {
          id: rider.id,
          riderCode: rider.rider_code || "",
          fullName: rider.full_name || rider.name || "Meal05 rider",
          phone: rider.phone || rider.contact_phone || "",
          vehicleType: rider.vehicle_type || "",
          vehicleNumber: rider.vehicle_plate_number || "",
        }
      : null,
  };
}

export async function loadDeliveryManifest(routeId) {
  const id = String(routeId || "").trim();
  if (!id) return null;
  const admin = getSupabaseAdminClient();
  const { data: route, error } = await admin
    .from("delivery_routes")
    .select(`
      id, route_code, status, vehicle_type, planned_start_time, actual_start_time, pickup_location, created_at,
      delivery_partners(rider_code, full_name, name, phone, contact_phone, vehicle_type, vehicle_plate_number),
      delivery_route_stops(
        id, order_id, stop_number, customer_name, customer_phone, delivery_address, delivery_landmark,
        delivery_notes, package_count, status,
        orders(order_reference, payment_status)
      )
    `)
    .eq("id", id)
    .maybeSingle();
  if (error || !route) return null;
  const partner = Array.isArray(route.delivery_partners) ? route.delivery_partners[0] : route.delivery_partners;
  const stops = (Array.isArray(route.delivery_route_stops) ? route.delivery_route_stops : [])
    .slice()
    .sort((a, b) => Number(a.stop_number) - Number(b.stop_number))
    .map((stop) => {
      const order = Array.isArray(stop.orders) ? stop.orders[0] : stop.orders;
      return {
        id: stop.id,
        orderId: stop.order_id,
        orderReference: order?.order_reference || stop.order_id,
        paymentStatus: order?.payment_status || "unknown",
        stopNumber: stop.stop_number,
        customerName: stop.customer_name,
        customerPhone: stop.customer_phone,
        deliveryAddress: stop.delivery_address,
        landmark: stop.delivery_landmark || "",
        instructions: stop.delivery_notes || "",
        packageCount: stop.package_count || 1,
        status: stop.status,
      };
    });

  return {
    id: route.id,
    routeCode: route.route_code,
    status: route.status,
    vehicleType: route.vehicle_type || partner?.vehicle_type || "",
    plannedStartTime: route.planned_start_time,
    actualStartTime: route.actual_start_time,
    pickupLocation: route.pickup_location || "Meal05 dispatch point",
    createdAt: route.created_at,
    rider: partner
      ? {
          riderCode: partner.rider_code || "",
          fullName: partner.full_name || partner.name || "Meal05 rider",
          phone: partner.phone || partner.contact_phone || "",
          vehicleType: partner.vehicle_type || route.vehicle_type || "",
          vehicleNumber: partner.vehicle_plate_number || "",
        }
      : null,
    stops,
  };
}
