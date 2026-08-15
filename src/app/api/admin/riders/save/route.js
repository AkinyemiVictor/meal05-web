import crypto from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApiUser } from "@/lib/admin-api-auth";
import { applyRateLimitHeaders, checkRateLimit } from "@/lib/api/rate-limit";
import { logAdminError, logAdminEvent } from "@/lib/api/log";
import { respondZodError } from "@/lib/api/validate";
import { normalizePhoneContact } from "@/lib/phone-links";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PHOTO_BYTES = 1_500_000;
const VEHICLE_TYPES = ["motorcycle", "napep", "korope", "car", "van", "other"];

const schema = z.object({
  id: z.string().uuid().optional(),
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(10).max(30),
  vehicleType: z.enum(VEHICLE_TYPES),
  vehicleNumber: z.string().trim().max(80).optional().default(""),
  operatingArea: z.string().trim().max(160).optional().default(""),
  isActive: z.boolean(),
  removePhoto: z.boolean().optional().default(false),
}).strict();

const slugify = (value) =>
  String(value || "rider")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-") || "rider";

const detectImage = (buffer, declaredType) => {
  if (declaredType === "image/png" && buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (declaredType === "image/jpeg" && buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpg";
  if (declaredType === "image/webp" && buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "webp";
  return "";
};

const parseBoolean = (value) => String(value || "").toLowerCase() === "true";

export async function POST(req) {
  const rl = await checkRateLimit({ request: req, id: "admin:riders:save", limit: 30, windowMs: 60_000 });
  const auth = await requireAdminApiUser();
  if (auth.response) return applyRateLimitHeaders(auth.response, rl);
  if (!rl.allowed) return applyRateLimitHeaders(NextResponse.json({ error: "Too many requests" }, { status: 429 }), rl);

  let form;
  try {
    form = await req.formData();
  } catch {
    return applyRateLimitHeaders(NextResponse.json({ error: "Invalid form submission." }, { status: 400 }), rl);
  }

  const raw = {
    id: String(form.get("id") || "").trim() || undefined,
    fullName: String(form.get("fullName") || ""),
    phone: String(form.get("phone") || ""),
    vehicleType: String(form.get("vehicleType") || ""),
    vehicleNumber: String(form.get("vehicleNumber") || ""),
    operatingArea: String(form.get("operatingArea") || ""),
    isActive: parseBoolean(form.get("isActive")),
    removePhoto: parseBoolean(form.get("removePhoto")),
  };
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return applyRateLimitHeaders(respondZodError(parsed.error), rl);

  const phone = normalizePhoneContact(parsed.data.phone);
  if (!phone) return applyRateLimitHeaders(NextResponse.json({ error: "Enter a valid rider phone number." }, { status: 400 }), rl);

  const photo = form.get("photo");
  const hasPhoto = photo instanceof File && photo.size > 0;
  if (hasPhoto && photo.size > MAX_PHOTO_BYTES) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Rider photo must be 1.5MB or less." }, { status: 400 }), rl);
  }

  const admin = getSupabaseAdminClient();
  const riderId = parsed.data.id || crypto.randomUUID();
  let existing = null;
  if (parsed.data.id) {
    const current = await admin
      .from("delivery_partners")
      .select("id, rider_code, full_name, name, phone, contact_phone, photo_path, vehicle_type, vehicle_plate_number, operating_area, is_active, status")
      .eq("id", parsed.data.id)
      .maybeSingle();
    if (current.error) return applyRateLimitHeaders(NextResponse.json({ error: current.error.message }, { status: 400 }), rl);
    if (!current.data) return applyRateLimitHeaders(NextResponse.json({ error: "Rider not found." }, { status: 404 }), rl);
    existing = current.data;
  }

  let newPhotoPath = "";
  if (hasPhoto) {
    const bytes = Buffer.from(await photo.arrayBuffer());
    const ext = detectImage(bytes, photo.type);
    if (!ext) return applyRateLimitHeaders(NextResponse.json({ error: "Upload a valid JPG, PNG, or WebP rider photo." }, { status: 400 }), rl);
    newPhotoPath = `${riderId}/${crypto.randomUUID()}.${ext}`;
    const uploaded = await admin.storage.from("rider-photos").upload(newPhotoPath, bytes, { contentType: photo.type, upsert: false });
    if (uploaded.error) {
      await logAdminError(uploaded.error, { route: "/api/admin/riders/save", actor: auth.user.email, rider_id: riderId, stage: "photo-upload" });
      return applyRateLimitHeaders(NextResponse.json({ error: "The rider photo could not be uploaded." }, { status: 400 }), rl);
    }
  }

  const normalizedPhone = phone.callUrl.replace(/^tel:/, "");
  const patch = {
    full_name: parsed.data.fullName,
    name: parsed.data.fullName,
    phone: normalizedPhone,
    contact_phone: normalizedPhone,
    vehicle_type: parsed.data.vehicleType,
    vehicle_plate_number: parsed.data.vehicleNumber || null,
    operating_area: parsed.data.operatingArea || null,
    is_active: parsed.data.isActive,
    status: parsed.data.isActive ? "active" : "inactive",
    integration_type: "manual",
    updated_at: new Date().toISOString(),
  };
  if (newPhotoPath) patch.photo_path = newPhotoPath;
  else if (parsed.data.removePhoto) patch.photo_path = null;

  let write;
  if (existing) {
    write = await admin.from("delivery_partners").update(patch).eq("id", riderId).select("id, rider_code, full_name, phone, photo_path, vehicle_type, vehicle_plate_number, operating_area, is_active, status").single();
  } else {
    write = await admin
      .from("delivery_partners")
      .insert({ ...patch, id: riderId, slug: `${slugify(parsed.data.fullName)}-${riderId.slice(0, 8)}` })
      .select("id, rider_code, full_name, phone, photo_path, vehicle_type, vehicle_plate_number, operating_area, is_active, status")
      .single();
  }

  if (write.error) {
    if (newPhotoPath) await admin.storage.from("rider-photos").remove([newPhotoPath]);
    await logAdminError(write.error, { route: "/api/admin/riders/save", actor: auth.user.email, rider_id: riderId, stage: existing ? "update" : "create" });
    return applyRateLimitHeaders(NextResponse.json({ error: write.error.message }, { status: 400 }), rl);
  }

  if (existing?.photo_path && existing.photo_path !== write.data.photo_path) {
    await admin.storage.from("rider-photos").remove([existing.photo_path]);
  }

  await logAdminEvent({
    route: "/api/admin/riders/save",
    actor: auth.user.email,
    rider_id: riderId,
    rider_code: write.data.rider_code,
    action: existing ? "rider_updated" : "rider_created",
    before: existing || undefined,
    after: { ...write.data, photo_path: write.data.photo_path ? "stored" : null },
    ok: true,
  });

  return applyRateLimitHeaders(NextResponse.json({ ok: true, rider: write.data }), rl);
}
