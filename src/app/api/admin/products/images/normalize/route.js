import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { hasAdminAccess } from "@/lib/admin-access";
import { checkRateLimit, applyRateLimitHeaders } from "@/lib/api/rate-limit";
import { logAdminEvent, logAdminError } from "@/lib/api/log";
import { detectImageMetadata } from "@/lib/image-metadata";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bucketName =
  process.env.NEXT_PUBLIC_SUPABASE_PRODUCT_IMAGE_BUCKET ||
  process.env.SUPABASE_PRODUCT_IMAGE_BUCKET ||
  "product-images";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

const VARIANTS = {
  thumb: { path: "thumb.webp", maxBytes: 180 * 1024, maxDimension: 360 },
  card: { path: "card.webp", maxBytes: 560 * 1024, maxDimension: 760 },
  detail: { path: "detail.webp", maxBytes: 1280 * 1024, maxDimension: 1600 },
};

const ORIGINAL_MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_ORIGINAL_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

const toId = (value) => {
  const num = Number(String(value || "").trim());
  return Number.isSafeInteger(num) && num > 0 ? num : null;
};

const isFileLike = (value) =>
  value &&
  typeof value === "object" &&
  typeof value.arrayBuffer === "function" &&
  typeof value.size === "number";

const response = (body, init = {}, rl) =>
  applyRateLimitHeaders(NextResponse.json(body, { ...init, headers: { ...NO_STORE_HEADERS, ...(init.headers || {}) } }), rl);

const publicUrlForPath = (storage, path) => {
  const { data } = storage.from(bucketName).getPublicUrl(path);
  return data?.publicUrl || path;
};

const storagePathFromUrl = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";
  if (!/^https?:\/\//i.test(text)) {
    return text.startsWith("/") ? "" : text;
  }
  try {
    const url = new URL(text);
    const marker = `/storage/v1/object/public/${bucketName}/`;
    const index = url.pathname.indexOf(marker);
    if (index === -1) return "";
    return decodeURIComponent(url.pathname.slice(index + marker.length));
  } catch {
    return "";
  }
};

const readAndValidateImage = async (file, { label, expectedMime, maxBytes, maxDimension }) => {
  if (!isFileLike(file)) {
    throw new Error(`${label} image is required.`);
  }
  if (file.size <= 0) {
    throw new Error(`${label} image is empty.`);
  }
  if (file.size > maxBytes) {
    throw new Error(`${label} image is too large.`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const metadata = detectImageMetadata(buffer);
  if (!metadata?.mime) {
    throw new Error(`${label} image type is not supported.`);
  }
  if (expectedMime && metadata.mime !== expectedMime) {
    throw new Error(`${label} image must be ${expectedMime}.`);
  }
  if (!expectedMime && !ALLOWED_ORIGINAL_MIME.has(metadata.mime)) {
    throw new Error(`${label} image must be JPEG, PNG, or WebP.`);
  }
  if (file.type && file.type !== metadata.mime) {
    throw new Error(`${label} image content does not match the uploaded MIME type.`);
  }
  if (maxDimension && metadata.width && metadata.height) {
    if (metadata.width > maxDimension || metadata.height > maxDimension) {
      throw new Error(`${label} image dimensions are too large.`);
    }
  }

  return { buffer, metadata };
};

export async function POST(req) {
  const rl = await checkRateLimit({ request: req, id: "admin:products:image-normalize", limit: 30, windowMs: 60_000 });
  if (!rl.allowed) {
    return response({ error: "Too many requests" }, { status: 429 }, rl);
  }

  const auth = getSupabaseRouteClient(await cookies());
  const {
    data: { user },
    error: authErr,
  } = await auth.auth.getUser();
  if (authErr) {
    await logAdminError(authErr, { route: "/api/admin/products/images/normalize", stage: "auth" });
    return response({ error: authErr.message }, { status: 401 }, rl);
  }
  if (!user) {
    await logAdminError("Not authenticated", { route: "/api/admin/products/images/normalize", stage: "auth" });
    return response({ error: "Not authenticated" }, { status: 401 }, rl);
  }

  const allowed = await hasAdminAccess({ userId: user.id, email: user.email });
  if (!allowed) {
    await logAdminError("Forbidden admin image upload attempt", {
      route: "/api/admin/products/images/normalize",
      actor: user.email,
    });
    return response({ error: "Forbidden" }, { status: 403 }, rl);
  }

  let formData;
  try {
    formData = await req.formData();
  } catch {
    return response({ error: "Invalid form data" }, { status: 400 }, rl);
  }

  const productId = toId(formData.get("productId"));
  if (!productId) {
    return response({ error: "Invalid product id" }, { status: 400 }, rl);
  }

  let original;
  let thumb;
  let card;
  let detail;
  try {
    original = await readAndValidateImage(formData.get("original"), {
      label: "Original",
      maxBytes: ORIGINAL_MAX_BYTES,
    });
    thumb = await readAndValidateImage(formData.get("thumb"), {
      label: "Thumbnail",
      expectedMime: "image/webp",
      maxBytes: VARIANTS.thumb.maxBytes,
      maxDimension: VARIANTS.thumb.maxDimension,
    });
    card = await readAndValidateImage(formData.get("card"), {
      label: "Card",
      expectedMime: "image/webp",
      maxBytes: VARIANTS.card.maxBytes,
      maxDimension: VARIANTS.card.maxDimension,
    });
    detail = await readAndValidateImage(formData.get("detail"), {
      label: "Detail",
      expectedMime: "image/webp",
      maxBytes: VARIANTS.detail.maxBytes,
      maxDimension: VARIANTS.detail.maxDimension,
    });
  } catch (error) {
    return response({ error: error.message || "Invalid image upload." }, { status: 400 }, rl);
  }

  const admin = getSupabaseAdminClient();
  const productRes = await admin.from("products").select("id, name, image_url").eq("id", productId).maybeSingle();
  if (productRes.error) {
    await logAdminError(productRes.error, {
      route: "/api/admin/products/images/normalize",
      actor: user.email,
      product_id: productId,
      stage: "product-lookup",
    });
    return response({ error: productRes.error.message }, { status: 400 }, rl);
  }
  if (!productRes.data) {
    return response({ error: "Product not found" }, { status: 404 }, rl);
  }

  const imageRes = await admin
    .from("product_images")
    .select("id, product_id, image_url, original_url, thumb_url, card_url, detail_url, position, is_primary")
    .eq("product_id", productId)
    .order("is_primary", { ascending: false })
    .order("position", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (imageRes.error) {
    await logAdminError(imageRes.error, {
      route: "/api/admin/products/images/normalize",
      actor: user.email,
      product_id: productId,
      stage: "image-lookup",
    });
    return response({ error: imageRes.error.message }, { status: 400 }, rl);
  }

  const originalPath = `${productId}/original.${original.metadata.extension}`;
  const paths = {
    original: originalPath,
    thumb: `${productId}/${VARIANTS.thumb.path}`,
    card: `${productId}/${VARIANTS.card.path}`,
    detail: `${productId}/${VARIANTS.detail.path}`,
  };

  const uploads = [
    { key: "original", buffer: original.buffer, contentType: original.metadata.mime },
    { key: "thumb", buffer: thumb.buffer, contentType: "image/webp" },
    { key: "card", buffer: card.buffer, contentType: "image/webp" },
    { key: "detail", buffer: detail.buffer, contentType: "image/webp" },
  ];

  for (const upload of uploads) {
    const result = await admin.storage.from(bucketName).upload(paths[upload.key], upload.buffer, {
      cacheControl: "31536000",
      contentType: upload.contentType,
      upsert: true,
    });
    if (result.error) {
      await logAdminError(result.error, {
        route: "/api/admin/products/images/normalize",
        actor: user.email,
        product_id: productId,
        storage_path: paths[upload.key],
        stage: "storage-upload",
      });
      return response({ error: result.error.message }, { status: 400 }, rl);
    }
  }

  const urls = {
    originalUrl: publicUrlForPath(admin.storage, paths.original),
    thumbUrl: publicUrlForPath(admin.storage, paths.thumb),
    cardUrl: publicUrlForPath(admin.storage, paths.card),
    detailUrl: publicUrlForPath(admin.storage, paths.detail),
  };
  const now = new Date().toISOString();
  const imagePatch = {
    image_url: urls.originalUrl,
    original_url: urls.originalUrl,
    thumb_url: urls.thumbUrl,
    card_url: urls.cardUrl,
    detail_url: urls.detailUrl,
    image_width: original.metadata.width,
    image_height: original.metadata.height,
    normalized_at: now,
    is_primary: true,
  };

  const existingImage = imageRes.data;
  const writeRes = existingImage
    ? await admin.from("product_images").update(imagePatch).eq("id", existingImage.id).select("id").maybeSingle()
    : await admin
        .from("product_images")
        .insert({ product_id: productId, position: 1, alt_text: productRes.data.name, ...imagePatch })
        .select("id")
        .maybeSingle();

  if (writeRes.error) {
    await logAdminError(writeRes.error, {
      route: "/api/admin/products/images/normalize",
      actor: user.email,
      product_id: productId,
      stage: "image-record-write",
    });
    return response({ error: writeRes.error.message }, { status: 400 }, rl);
  }

  const productUpdateRes = await admin.from("products").update({ image_url: urls.cardUrl }).eq("id", productId);
  if (productUpdateRes.error) {
    await logAdminError(productUpdateRes.error, {
      route: "/api/admin/products/images/normalize",
      actor: user.email,
      product_id: productId,
      stage: "product-fallback-image-update",
    });
  }

  const obsoletePaths = [
    existingImage?.thumb_url,
    existingImage?.card_url,
    existingImage?.detail_url,
  ]
    .map(storagePathFromUrl)
    .filter(
      (path, index, all) =>
        path &&
        all.indexOf(path) === index &&
        path.startsWith(`${productId}/`) &&
        !Object.values(paths).includes(path)
    );
  if (obsoletePaths.length) {
    await admin.storage.from(bucketName).remove(obsoletePaths);
  }

  await logAdminEvent({
    route: "/api/admin/products/images/normalize",
    actor: user.email,
    product_id: productId,
    product_name: productRes.data.name,
    image_record_id: writeRes.data?.id,
    original_bytes: original.buffer.length,
    thumb_bytes: thumb.buffer.length,
    card_bytes: card.buffer.length,
    detail_bytes: detail.buffer.length,
    ok: true,
  });

  return response(
    {
      ok: true,
      image: {
        id: writeRes.data?.id || existingImage?.id || null,
        ...urls,
      },
      bytes: {
        original: original.buffer.length,
        thumb: thumb.buffer.length,
        card: card.buffer.length,
        detail: detail.buffer.length,
      },
    },
    { status: 200 },
    rl
  );
}
