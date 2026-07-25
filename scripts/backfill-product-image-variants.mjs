import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ path: ".env", override: false, quiet: true });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucketName =
  process.env.NEXT_PUBLIC_SUPABASE_PRODUCT_IMAGE_BUCKET ||
  process.env.SUPABASE_PRODUCT_IMAGE_BUCKET ||
  "product-images";

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this script.");
}

const args = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, ...rest] = arg.slice(2).split("=");
      return [key, rest.length ? rest.join("=") : "true"];
    })
);

const limit = Math.min(50, Math.max(1, Number(args.get("limit") || 20)));
const cursor = args.get("cursor") ? String(args.get("cursor")) : "";
const dryRun = args.get("dry-run") === "true";
const force = args.get("force") === "true";

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const publicUrlForPath = (path) => {
  const { data } = supabase.storage.from(bucketName).getPublicUrl(path);
  return data?.publicUrl || path;
};

const sourceUrlForValue = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  if (text.startsWith("/")) return "";
  return publicUrlForPath(text);
};

const hasAllVariants = (row) => Boolean(row?.thumb_url && row?.card_url && row?.detail_url);

const makeVariant = async (buffer, { width, quality }) =>
  sharp(buffer, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width, height: width, fit: "inside", withoutEnlargement: true })
    .webp({ quality, effort: 4 })
    .toBuffer();

const fetchImageBuffer = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status}`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("image/")) {
    throw new Error(`Source is not an image (${contentType || "unknown content type"})`);
  }
  return Buffer.from(await response.arrayBuffer());
};

const uploadVariant = async (path, buffer) => {
  const result = await supabase.storage.from(bucketName).upload(path, buffer, {
    cacheControl: "31536000",
    contentType: "image/webp",
    upsert: true,
  });
  if (result.error) throw result.error;
  return publicUrlForPath(path);
};

let query = supabase
  .from("product_images")
  .select("id, product_id, image_url, original_url, thumb_url, card_url, detail_url, normalized_at")
  .order("id", { ascending: true })
  .limit(limit);

if (cursor) query = query.gt("id", cursor);

const { data: rows, error } = await query;
if (error) throw error;

console.log(`Backfill batch: ${rows?.length || 0} row(s), limit=${limit}, cursor=${cursor || "start"}, dryRun=${dryRun}`);

let processed = 0;
let skipped = 0;
let failed = 0;
let lastId = cursor || "";

for (const row of rows || []) {
  lastId = row.id;
  if (!force && hasAllVariants(row)) {
    skipped += 1;
    console.log(`skip product_image=${row.id} product=${row.product_id} already has variants`);
    continue;
  }

  try {
    const sourceUrl = sourceUrlForValue(row.original_url || row.image_url);
    if (!sourceUrl) throw new Error("No fetchable source image URL");

    console.log(`process product_image=${row.id} product=${row.product_id}`);
    const sourceBuffer = await fetchImageBuffer(sourceUrl);
    const metadata = await sharp(sourceBuffer, { limitInputPixels: 40_000_000 }).metadata();

    const [thumbBuffer, cardBuffer, detailBuffer] = await Promise.all([
      makeVariant(sourceBuffer, { width: 280, quality: 82 }),
      makeVariant(sourceBuffer, { width: 640, quality: 82 }),
      makeVariant(sourceBuffer, { width: 1400, quality: 86 }),
    ]);

    const paths = {
      thumb: `${row.product_id}/${row.id}/thumb.webp`,
      card: `${row.product_id}/${row.id}/card.webp`,
      detail: `${row.product_id}/${row.id}/detail.webp`,
    };

    if (dryRun) {
      console.log(
        `dry-run bytes thumb=${thumbBuffer.length} card=${cardBuffer.length} detail=${detailBuffer.length}`
      );
      processed += 1;
      continue;
    }

    const [thumbUrl, cardUrl, detailUrl] = await Promise.all([
      uploadVariant(paths.thumb, thumbBuffer),
      uploadVariant(paths.card, cardBuffer),
      uploadVariant(paths.detail, detailBuffer),
    ]);

    const update = await supabase
      .from("product_images")
      .update({
        thumb_url: thumbUrl,
        card_url: cardUrl,
        detail_url: detailUrl,
        original_url: row.original_url || row.image_url || sourceUrl,
        image_width: metadata.width || null,
        image_height: metadata.height || null,
        normalized_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    if (update.error) throw update.error;
    processed += 1;
    console.log(`ok product_image=${row.id} card=${Math.round(cardBuffer.length / 1024)}KB`);
  } catch (error) {
    failed += 1;
    console.error(`fail product_image=${row.id} product=${row.product_id}: ${error.message}`);
  }
}

console.log(`Done. processed=${processed} skipped=${skipped} failed=${failed} nextCursor=${lastId || ""}`);
