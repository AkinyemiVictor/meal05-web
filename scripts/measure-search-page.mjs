import { performance } from "node:perf_hooks";

const DEFAULT_BASE_URL = process.env.MEAL05_MEASURE_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const baseUrl = (process.argv[2] || DEFAULT_BASE_URL).replace(/\/$/, "");
const terms = process.argv.slice(3).length ? process.argv.slice(3) : ["rice", "pepper", "peper", "ata rodo", "beans", "oil"];

const absoluteUrl = (value, pageUrl) => {
  if (!String(value || "").trim()) return "";
  try {
    const decoded = String(value || "")
      .replace(/&amp;/g, "&")
      .replace(/&#x2F;/g, "/")
      .replace(/&#47;/g, "/")
      .replace(/&quot;/g, '"');
    return new URL(decoded, pageUrl).toString();
  } catch {
    return "";
  }
};

const unique = (items) => [...new Set(items.filter(Boolean))];

const parseSrcsetChoice = (srcset, pageUrl, targetWidth = 640) => {
  const candidates = String(srcset || "")
    .split(",")
    .map((entry) => {
      const [url, descriptor] = entry.trim().split(/\s+/);
      const width = descriptor?.endsWith("w") ? Number.parseInt(descriptor, 10) : null;
      return { url: absoluteUrl(url, pageUrl), width: Number.isFinite(width) ? width : null };
    })
    .filter((entry) => entry.url);
  if (!candidates.length) return "";
  const sorted = candidates.sort((a, b) => (a.width || Number.MAX_SAFE_INTEGER) - (b.width || Number.MAX_SAFE_INTEGER));
  return (sorted.find((entry) => entry.width && entry.width >= targetWidth) || sorted[0]).url;
};

const getAttribute = (tag, name) => {
  const match = tag.match(new RegExp(`\\b${name}=["']([^"']+)["']`, "i"));
  return match?.[1] || "";
};

const parseAssetUrls = (html, pageUrl) => {
  const scripts = unique(
    [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
      .map((match) => absoluteUrl(match[1], pageUrl))
  );
  const imageTags = [...html.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0]);
  const images = unique(imageTags.map((tag) => absoluteUrl(getAttribute(tag, "src"), pageUrl)));
  const mobileImages = unique(
    imageTags.map((tag) => parseSrcsetChoice(getAttribute(tag, "srcset"), pageUrl) || absoluteUrl(getAttribute(tag, "src"), pageUrl))
  );
  return { scripts, images, mobileImages };
};

const fetchBytes = async (url) => {
  const started = performance.now();
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Meal05PerfProbe/1.0",
    },
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    url,
    status: response.status,
    ms: Math.round(performance.now() - started),
    bytes: buffer.byteLength,
    contentType: response.headers.get("content-type") || "",
    cacheControl: response.headers.get("cache-control") || "",
    body: buffer,
  };
};

for (const term of terms) {
  const pageUrl = `${baseUrl}/search?q=${encodeURIComponent(term)}`;
  const page = await fetchBytes(pageUrl);
  const html = page.body.toString("utf8");
  const { scripts, images, mobileImages } = parseAssetUrls(html, pageUrl);
  const productCards = (html.match(/meal05-product-card/g) || []).length;
  const quickAddButtons = (html.match(/<button\b[^>]*>[\s\S]*?Add to cart[\s\S]*?<\/button>/gi) || []).length;
  const productImageCandidates = mobileImages.filter((url) => !/logo|favicon|icon|avatar|placeholder/i.test(url));
  const visibleImages = (productImageCandidates.length ? productImageCandidates : mobileImages).slice(0, Math.min(productImageCandidates.length || mobileImages.length, 12));

  const imageResults = await Promise.all(
    visibleImages.map(async (imageUrl) => {
      try {
        const result = await fetchBytes(imageUrl);
        return {
          status: result.status,
          bytes: result.bytes,
          ms: result.ms,
          contentType: result.contentType,
          url: imageUrl,
        };
      } catch (error) {
        return { status: 0, bytes: 0, ms: 0, contentType: "", url: imageUrl, error: error.message };
      }
    })
  );

  const totalImageBytes = imageResults.reduce((sum, image) => sum + image.bytes, 0);
  const largestImage = imageResults.reduce((largest, image) => (image.bytes > largest.bytes ? image : largest), { bytes: 0 });

  console.log(JSON.stringify({
    term,
    status: page.status,
    documentMs: page.ms,
    documentBytes: page.bytes,
    productCards,
    quickAddButtons,
    scriptReferences: scripts.length,
    imageReferences: images.length,
    mobileImageChoices: mobileImages.length,
    productImageCandidates: productImageCandidates.length,
    fetchedImages: imageResults.length,
    totalFetchedImageBytes: totalImageBytes,
    largestFetchedImageBytes: largestImage.bytes,
    largestFetchedImageUrl: largestImage.url || "",
    cacheControl: page.cacheControl,
  }));
}
