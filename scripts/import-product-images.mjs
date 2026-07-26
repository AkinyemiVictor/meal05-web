import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
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

const VARIANTS = {
  thumb: { width: 280, quality: 82, filename: "thumb.webp" },
  card: { width: 640, quality: 82, filename: "card.webp" },
  detail: { width: 1400, quality: 86, filename: "detail.webp" },
};

const MIME_BY_FORMAT = {
  jpeg: { mime: "image/jpeg", extension: "jpg" },
  jpg: { mime: "image/jpeg", extension: "jpg" },
  png: { mime: "image/png", extension: "png" },
  webp: { mime: "image/webp", extension: "webp" },
};

const args = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, ...rest] = arg.slice(2).split("=");
      return [key, rest.length ? rest.join("=") : "true"];
    })
);

const showHelp = () => {
  console.log(`
Import product image batches into Supabase Storage and public.product_images.

Usage:
  npm run images:import -- --manifest=product-image-batch.example.json
  npm run images:import -- --manifest=product-image-batch.json --root=C:\\path\\to\\images --commit

Defaults to dry-run. Nothing is written unless --commit is passed.

Manifest shape:
{
  "root": "./local-images",
  "items": [
    { "productId": 123, "file": "dangote-spaghetti-main.jpg", "role": "primary" },
    { "sku": "DANGOTE-SPAGHETTI-500G", "file": "dangote-spaghetti-side.jpg", "role": "gallery" },
    {
      "productId": 456,
      "files": [
        { "path": "rice/front.jpg", "role": "primary" },
        "rice/angle.jpg"
      ]
    }
  ]
}
`);
};

if (args.has("help") || args.has("h")) {
  showHelp();
  process.exit(0);
}

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this script.");
}

const manifestPath = args.get("manifest");
if (!manifestPath) {
  showHelp();
  throw new Error("Pass --manifest=<path-to-json>.");
}

const commit = args.get("commit") === "true";
const dryRun = !commit;
const runBatchId = String(args.get("batch-id") || new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14))
  .replace(/[^a-z0-9-]+/gi, "-")
  .replace(/^-|-$/g, "")
  .toLowerCase();
const manifestAbsolutePath = path.resolve(String(manifestPath));
const manifestDir = path.dirname(manifestAbsolutePath);

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const normalizeText = (value) => String(value || "").trim();
const normalizeLookup = (value) => normalizeText(value).toLowerCase();
const toId = (value) => {
  const num = Number(String(value || "").trim());
  return Number.isSafeInteger(num) && num > 0 ? String(num) : "";
};

const slugify = (value) =>
  normalizeText(value)
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 80) || "image";

const unique = (values) => Array.from(new Set(values.filter(Boolean)));

const publicUrlForPath = (storagePath) => {
  const { data } = supabase.storage.from(bucketName).getPublicUrl(storagePath);
  return data?.publicUrl || storagePath;
};

const readJson = async (filePath) => {
  const content = await fs.readFile(filePath, "utf8");
  return JSON.parse(content.replace(/^\uFEFF/, ""));
};

const resolveRoot = (manifest) => {
  const cliRoot = args.get("root");
  const root = cliRoot || manifest.root || ".";
  return path.resolve(manifestDir, String(root));
};

const normalizeRole = (value) => {
  const role = normalizeLookup(value || "gallery");
  if (["primary", "main", "replace", "replace-primary"].includes(role)) return "primary";
  return "gallery";
};

const filePathFromSpec = (spec) => {
  if (typeof spec === "string") return spec;
  return spec?.path || spec?.file || spec?.filename || "";
};

const productKeysFrom = (item, fileSpec = {}) => ({
  productId: toId(fileSpec.productId ?? fileSpec.product_id ?? item.productId ?? item.product_id),
  sku: normalizeText(fileSpec.sku ?? item.sku),
  productName: normalizeText(fileSpec.productName ?? fileSpec.product_name ?? item.productName ?? item.product_name ?? item.name),
});

const flattenManifest = (manifest, rootDir) => {
  const items = Array.isArray(manifest) ? manifest : manifest.items;
  if (!Array.isArray(items) || !items.length) {
    throw new Error("Manifest must be an array or an object with a non-empty items array.");
  }

  return items.flatMap((item, itemIndex) => {
    const files = item.files || item.images || item.gallery;
    const specs = Array.isArray(files) ? files : [item];
    return specs.map((fileSpec, fileIndex) => {
      const relativeFile = normalizeText(filePathFromSpec(fileSpec));
      const role = normalizeRole(fileSpec.role ?? fileSpec.type ?? item.role ?? item.type);
      const keys = productKeysFrom(item, fileSpec);
      return {
        index: `${itemIndex + 1}.${fileIndex + 1}`,
        ...keys,
        role,
        isPrimary: role === "primary" || fileSpec.primary === true || item.primary === true,
        file: relativeFile,
        absoluteFile: path.resolve(rootDir, relativeFile),
        altText: normalizeText(fileSpec.alt ?? fileSpec.altText ?? item.alt ?? item.altText),
        variantId: toId(fileSpec.variantId ?? fileSpec.variant_id ?? item.variantId ?? item.variant_id) || null,
      };
    });
  });
};

const loadProducts = async () => {
  const { data, error } = await supabase
    .from("products")
    .select("id, name, sku")
    .order("id", { ascending: true })
    .range(0, 9999);
  if (error) throw error;

  const byId = new Map();
  const bySku = new Map();
  const byName = new Map();

  for (const product of data || []) {
    const id = String(product.id);
    byId.set(id, product);
    if (product.sku) bySku.set(normalizeLookup(product.sku), product);
    const nameKey = normalizeLookup(product.name);
    if (nameKey) {
      const existing = byName.get(nameKey);
      byName.set(nameKey, existing ? "ambiguous" : product);
    }
  }

  return { byId, bySku, byName };
};

const resolveProduct = (entry, products) => {
  if (entry.productId) {
    const product = products.byId.get(entry.productId);
    if (!product) throw new Error(`Manifest item ${entry.index}: productId ${entry.productId} was not found.`);
    return product;
  }
  if (entry.sku) {
    const product = products.bySku.get(normalizeLookup(entry.sku));
    if (!product) throw new Error(`Manifest item ${entry.index}: sku "${entry.sku}" was not found.`);
    return product;
  }
  if (entry.productName) {
    const product = products.byName.get(normalizeLookup(entry.productName));
    if (product === "ambiguous") {
      throw new Error(`Manifest item ${entry.index}: productName "${entry.productName}" matches more than one product. Use productId or sku.`);
    }
    if (!product) throw new Error(`Manifest item ${entry.index}: productName "${entry.productName}" was not found.`);
    return product;
  }
  throw new Error(`Manifest item ${entry.index}: add productId, sku, or exact productName.`);
};

const validateFiles = async (entries) => {
  const validated = [];
  for (const entry of entries) {
    if (!entry.file) throw new Error(`Manifest item ${entry.index}: missing file/path.`);
    const buffer = await fs.readFile(entry.absoluteFile);
    const metadata = await sharp(buffer, { limitInputPixels: 40_000_000 }).metadata();
    const mime = MIME_BY_FORMAT[metadata.format];
    if (!mime) {
      throw new Error(`Manifest item ${entry.index}: unsupported image type for ${entry.file}. Use JPEG, PNG, or WebP.`);
    }
    validated.push({ ...entry, buffer, metadata, mime });
  }
  return validated;
};

const checkPrimaryConflicts = (entries) => {
  const primaryByProduct = new Map();
  for (const entry of entries) {
    if (!entry.isPrimary) continue;
    const productId = String(entry.product.id);
    const existing = primaryByProduct.get(productId) || [];
    existing.push(entry.file);
    primaryByProduct.set(productId, existing);
  }
  const conflicts = Array.from(primaryByProduct.entries()).filter(([, files]) => files.length > 1);
  if (conflicts.length) {
    const lines = conflicts.map(([productId, files]) => `product ${productId}: ${files.join(", ")}`);
    throw new Error(`Only one primary image is allowed per product per import.\n${lines.join("\n")}`);
  }
};

const loadPositions = async (productIds) => {
  const positions = new Map(productIds.map((id) => [String(id), 0]));
  if (!productIds.length) return positions;

  const { data, error } = await supabase
    .from("product_images")
    .select("product_id, position")
    .in("product_id", productIds);
  if (error) throw error;

  for (const row of data || []) {
    const productId = String(row.product_id);
    const position = Number(row.position);
    if (Number.isFinite(position)) {
      positions.set(productId, Math.max(positions.get(productId) || 0, position));
    }
  }
  return positions;
};

const makeVariant = async (buffer, { width, quality }) =>
  sharp(buffer, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width, height: width, fit: "inside", withoutEnlargement: true })
    .webp({ quality, effort: 4 })
    .toBuffer();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const withRetry = async (label, fn, attempts = 4) => {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      const delay = 1000 * attempt * attempt;
      console.warn(`retry ${label} attempt=${attempt + 1}/${attempts} after ${error.message}`);
      await sleep(delay);
    }
  }
  throw lastError;
};

const upload = async ({ storagePath, buffer, contentType }) => {
  const result = await withRetry(`upload ${storagePath}`, async () => {
    const uploadResult = await supabase.storage.from(bucketName).upload(storagePath, buffer, {
      cacheControl: "31536000",
      contentType,
      upsert: true,
    });
    if (uploadResult.error) throw uploadResult.error;
    return uploadResult;
  });
  if (result.error) throw result.error;
  return publicUrlForPath(storagePath);
};

const updatePrimaryImage = async ({ productId, imageId, cardUrl }) => {
  const clearPrimary = await supabase
    .from("product_images")
    .update({ is_primary: false })
    .eq("product_id", productId)
    .neq("id", imageId);
  if (clearPrimary.error) throw clearPrimary.error;

  const setPrimary = await supabase
    .from("product_images")
    .update({ is_primary: true })
    .eq("id", imageId);
  if (setPrimary.error) throw setPrimary.error;

  const productUpdate = await supabase
    .from("products")
    .update({ image_url: cardUrl })
    .eq("id", productId);
  if (productUpdate.error && !String(productUpdate.error.message || "").includes("'image_url' column")) {
    throw productUpdate.error;
  }
};

const updateImageVariants = async ({ imageId, entry, existing = {} }) => {
  const paths = {
    thumb: `${entry.product.id}/${imageId}/${VARIANTS.thumb.filename}`,
    card: `${entry.product.id}/${imageId}/${VARIANTS.card.filename}`,
    detail: `${entry.product.id}/${imageId}/${VARIANTS.detail.filename}`,
  };

  const updates = {};
  const jobs = [];
  for (const [key, variant] of Object.entries(VARIANTS)) {
    const column = `${key}_url`;
    if (existing[column]) {
      updates[column] = existing[column];
      continue;
    }

    jobs.push(
      makeVariant(entry.buffer, variant)
        .then((buffer) => upload({ storagePath: paths[key], buffer, contentType: "image/webp" }))
        .then((url) => {
          updates[column] = url;
        })
    );
  }

  await Promise.all(jobs);

  if (Object.keys(updates).length) {
    const update = await supabase
      .from("product_images")
      .update({
        ...updates,
        normalized_at: new Date().toISOString(),
      })
      .eq("id", imageId);
    if (update.error) throw update.error;
  }

  return updates;
};

const findExistingImage = async ({ productId, safeBase }) => {
  const { data, error } = await supabase
    .from("product_images")
    .select("id, image_url, original_url, thumb_url, card_url, detail_url")
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;

  const marker = `/${productId}/gallery/`;
  const suffix = `-${safeBase}/original.`;
  return (data || []).find((row) => {
    const originalUrl = row.original_url || row.image_url || "";
    return originalUrl.includes(marker) && originalUrl.includes(suffix);
  });
};

const importImage = async (entry, position) => {
  const productId = String(entry.product.id);
  const safeBase = slugify(entry.file);
  const originalPath = `${productId}/gallery/${runBatchId}-${safeBase}/original.${entry.mime.extension}`;

  if (dryRun) {
    return {
      id: "dry-run",
      originalUrl: publicUrlForPath(originalPath),
      thumbUrl: "",
      cardUrl: "",
      detailUrl: "",
      position,
    };
  }

  const existingImage = await findExistingImage({ productId, safeBase });
  if (existingImage) {
    const variantUrls = await updateImageVariants({ imageId: existingImage.id, entry, existing: existingImage });
    const cardUrl = variantUrls.card_url || existingImage.card_url || existingImage.image_url;
    if (entry.isPrimary) await updatePrimaryImage({ productId, imageId: existingImage.id, cardUrl });
    return {
      id: existingImage.id,
      originalUrl: existingImage.original_url || existingImage.image_url,
      thumbUrl: variantUrls.thumb_url || existingImage.thumb_url,
      cardUrl,
      detailUrl: variantUrls.detail_url || existingImage.detail_url,
      position,
      existing: true,
    };
  }

  const originalUrl = await upload({
    storagePath: originalPath,
    buffer: entry.buffer,
    contentType: entry.mime.mime,
  });

  const insert = await supabase
    .from("product_images")
    .insert({
      product_id: productId,
      variant_id: entry.variantId,
      image_url: originalUrl,
      original_url: originalUrl,
      alt_text: entry.altText || entry.product.name,
      position,
      is_primary: false,
      image_width: entry.metadata.width || null,
      image_height: entry.metadata.height || null,
    })
    .select("id")
    .maybeSingle();

  if (insert.error) throw insert.error;
  const imageId = insert.data?.id;
  if (!imageId) throw new Error("Supabase did not return a product_images id.");

  const [thumbBuffer, cardBuffer, detailBuffer] = await Promise.all([
    makeVariant(entry.buffer, VARIANTS.thumb),
    makeVariant(entry.buffer, VARIANTS.card),
    makeVariant(entry.buffer, VARIANTS.detail),
  ]);

  const paths = {
    thumb: `${productId}/${imageId}/${VARIANTS.thumb.filename}`,
    card: `${productId}/${imageId}/${VARIANTS.card.filename}`,
    detail: `${productId}/${imageId}/${VARIANTS.detail.filename}`,
  };

  const [thumbUrl, cardUrl, detailUrl] = await Promise.all([
    upload({ storagePath: paths.thumb, buffer: thumbBuffer, contentType: "image/webp" }),
    upload({ storagePath: paths.card, buffer: cardBuffer, contentType: "image/webp" }),
    upload({ storagePath: paths.detail, buffer: detailBuffer, contentType: "image/webp" }),
  ]);

  const update = await supabase
    .from("product_images")
    .update({
      thumb_url: thumbUrl,
      card_url: cardUrl,
      detail_url: detailUrl,
      normalized_at: new Date().toISOString(),
    })
    .eq("id", imageId);
  if (update.error) throw update.error;

  if (entry.isPrimary) {
    await updatePrimaryImage({ productId, imageId, cardUrl });
  }

  return { id: imageId, originalUrl, thumbUrl, cardUrl, detailUrl, position };
};

const manifest = await readJson(manifestAbsolutePath);
const rootDir = resolveRoot(manifest);
const flattened = flattenManifest(manifest, rootDir);
const products = await loadProducts();
const resolved = flattened.map((entry) => ({ ...entry, product: resolveProduct(entry, products) }));
checkPrimaryConflicts(resolved);
const validated = await validateFiles(resolved);
const productIds = unique(validated.map((entry) => String(entry.product.id)));
const positions = await loadPositions(productIds);

console.log(`Product image import: ${validated.length} image(s), ${productIds.length} product(s), bucket=${bucketName}, mode=${dryRun ? "dry-run" : "commit"}`);
console.log(`Image root: ${rootDir}`);

let imported = 0;
let failed = 0;

for (const entry of validated) {
  const productId = String(entry.product.id);
  const nextPosition = (positions.get(productId) || 0) + 1;
  positions.set(productId, nextPosition);

  try {
    console.log(
      `${dryRun ? "plan" : "import"} product=${productId} sku=${entry.product.sku || "-"} role=${entry.isPrimary ? "primary" : "gallery"} position=${nextPosition} file=${entry.file}`
    );
    const result = await importImage(entry, nextPosition);
    imported += 1;
    if (!dryRun) {
      console.log(`${result.existing ? "resume" : "ok"} product_image=${result.id} card=${result.cardUrl}`);
    }
  } catch (error) {
    failed += 1;
    console.error(`fail product=${productId} file=${entry.file}: ${error.message}`);
  }
}

console.log(`Done. ${dryRun ? "planned" : "imported"}=${imported} failed=${failed}`);
if (dryRun) console.log("Dry-run only. Re-run with --commit to upload files and write product_images rows.");
if (failed > 0) process.exitCode = 1;
