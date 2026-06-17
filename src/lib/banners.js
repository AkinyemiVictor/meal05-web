import "server-only";

export const BANNER_TABLE_NAME = "banner_urls";
export const HERO_BANNER_BUCKET = "hero_banners";
export const DEFAULT_BANNER_PLACEMENT = "hero";

const MOBILE_FILE_TAGS = ["mobile view", "mobile-view", "mobile_view", "mobile"];
const TOKEN_STOP_WORDS = new Set(["meal05", "mobile", "view"]);

const pickFirst = (obj, keys) => {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return undefined;
};

const toStringOrEmpty = (value) => (value === null || value === undefined ? "" : String(value));

const toFiniteNumberOrNull = (value) => {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const clampText = (value, max = 500) => {
  const trimmed = toStringOrEmpty(value).trim();
  if (!trimmed) return "";
  return trimmed.slice(0, max);
};

const parseHeading = (value, fallback) => {
  if (Array.isArray(value)) return value.map((line) => clampText(line, 120)).filter(Boolean);

  const text = clampText(value, 400);
  if (text) {
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.length) return lines;
  }

  return fallback ? [fallback] : [];
};

export const normalizeBannerDateTime = (value) => {
  const text = toStringOrEmpty(value).trim();
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

export const normalizeBannerText = (value, { max = 500 } = {}) => {
  const text = clampText(value, max);
  return text || null;
};

export const normalizeBannerPlacement = (value) => {
  const placement = toStringOrEmpty(value).trim().toLowerCase();
  if (placement === "advert" || placement === "ad") return "advert";
  return DEFAULT_BANNER_PLACEMENT;
};

export const normaliseImageUrl = (value, { bucketName = HERO_BANNER_BUCKET } = {}) => {
  const raw = toStringOrEmpty(value).trim();
  if (!raw) return "";

  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/")) return raw;

  const base = toStringOrEmpty(process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/+$/, "");
  if (!base) return raw;

  if (raw.startsWith("storage/")) return `${base}/${raw}`;
  if (raw.startsWith("/storage/")) return `${base}${raw}`;

  const cleaned = raw.replace(/^\/+/, "").replace(new RegExp(`^${bucketName}/+`), "");
  return `${base}/storage/v1/object/public/${bucketName}/${cleaned}`;
};

export const extractBannerFileName = (value) => {
  const raw = toStringOrEmpty(value).trim();
  if (!raw) return "";

  try {
    if (/^https?:\/\//i.test(raw)) {
      const parsed = new URL(raw);
      const parts = parsed.pathname.split("/").filter(Boolean);
      return decodeURIComponent(parts[parts.length - 1] || "");
    }
  } catch {}

  const plain = raw.split("?")[0].split("#")[0];
  const parts = plain.split("/").filter(Boolean);
  return decodeURIComponent(parts[parts.length - 1] || "");
};

const tokenizeName = (value) => {
  const file = extractBannerFileName(value).toLowerCase();
  if (!file) return [];
  const base = file.replace(/\.[a-z0-9]+$/i, "");
  const tokens = base.replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  return tokens.filter((token) => !TOKEN_STOP_WORDS.has(token));
};

const scoreTokenOverlap = (leftTokens, rightTokens) => {
  if (!leftTokens.length || !rightTokens.length) return 0;
  const right = new Set(rightTokens);
  let score = 0;
  for (const token of leftTokens) {
    if (right.has(token)) score += 1;
  }
  return score;
};

export const buildMobileCandidates = (client, files, bucketName = HERO_BANNER_BUCKET) => {
  const rows = Array.isArray(files) ? files : [];
  const candidates = [];
  for (const file of rows) {
    const name = toStringOrEmpty(file?.name).trim();
    if (!name) continue;
    const lower = name.toLowerCase();
    if (!MOBILE_FILE_TAGS.some((tag) => lower.includes(tag))) continue;
    const publicUrl = client.storage.from(bucketName).getPublicUrl(name)?.data?.publicUrl || "";
    if (!publicUrl) continue;
    candidates.push({ name, publicUrl, tokens: tokenizeName(name) });
  }
  return candidates;
};

export const inferMobileImage = (imageUrl, candidates) => {
  const safeCandidates = Array.isArray(candidates) ? candidates : [];
  if (!imageUrl || !safeCandidates.length) return "";

  const imageFileName = extractBannerFileName(imageUrl).toLowerCase();
  if (MOBILE_FILE_TAGS.some((tag) => imageFileName.includes(tag))) {
    return "";
  }

  const imageTokens = tokenizeName(imageUrl);
  if (!imageTokens.length) return "";

  let best = null;
  let bestScore = 0;
  for (const candidate of safeCandidates) {
    const score = scoreTokenOverlap(imageTokens, candidate.tokens);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  if (!best || bestScore < 2) return "";
  return best.publicUrl;
};

export const normalizeBannerRecord = (row) => {
  if (!row || typeof row !== "object") return null;

  const idRaw = pickFirst(row, ["id", "uuid", "banner_id", "bannerId", "key", "slug", "tag"]);
  const title = clampText(pickFirst(row, ["title", "name", "headline"]), 140);
  const heading = parseHeading(pickFirst(row, ["heading", "heading_lines", "headingLines"]), title);
  const tag = clampText(pickFirst(row, ["tag", "eyebrow", "badge"]), 80);
  const description = clampText(pickFirst(row, ["description", "subtitle", "sub_title", "body", "text"]), 240);
  const image = normaliseImageUrl(
    pickFirst(row, ["image_url", "imageUrl", "image", "banner_url", "bannerUrl", "src", "url"])
  );
  const mobileImage = normaliseImageUrl(
    pickFirst(row, [
      "mobile_image_url",
      "mobileImageUrl",
      "mobile_image",
      "mobileImage",
      "image_mobile_url",
      "imageMobileUrl",
      "mobile_banner_url",
      "mobileBannerUrl",
      "mobile_src",
      "mobileSrc",
    ])
  );
  const alt = clampText(pickFirst(row, ["alt", "alt_text", "altText", "image_alt", "imageAlt"]), 160) || title;
  const href = clampText(pickFirst(row, ["href", "cta_href", "ctaHref", "link", "link_url", "linkUrl"]), 500);
  const ctaLabel = clampText(pickFirst(row, ["cta_label", "ctaLabel", "button_label", "buttonLabel"]), 48);
  const accent = clampText(pickFirst(row, ["accent", "accent_color", "accentColor"]), 32);
  const accentSoft = clampText(
    pickFirst(row, ["accent_soft", "accentSoft", "accent_color_soft", "accentColorSoft"]),
    64
  );

  const position = toFiniteNumberOrNull(pickFirst(row, ["position", "sort_order", "sortOrder", "order"]));
  const placement = normalizeBannerPlacement(pickFirst(row, ["placement", "slot", "kind", "type"]));
  const isActiveRaw = pickFirst(row, ["is_active", "isActive", "active", "enabled"]);
  const isActive =
    typeof isActiveRaw === "boolean"
      ? isActiveRaw
      : typeof isActiveRaw === "number"
        ? isActiveRaw !== 0
        : typeof isActiveRaw === "string"
          ? ["true", "1", "yes", "y"].includes(isActiveRaw.trim().toLowerCase())
          : null;

  const startsAt = normalizeBannerDateTime(pickFirst(row, ["starts_at", "startsAt", "start_at", "startAt"]));
  const expiresAt = normalizeBannerDateTime(pickFirst(row, ["expires_at", "expiresAt", "ends_at", "endAt"]));
  const createdAt = normalizeBannerDateTime(pickFirst(row, ["created_at", "createdAt"]));
  const id = idRaw !== undefined ? String(idRaw) : title || tag || image;
  if (!id) return null;

  return {
    id,
    title,
    heading,
    headingText: heading.join("\n"),
    tag,
    description,
    image,
    mobileImage,
    alt,
    href,
    ctaLabel,
    accent,
    accentSoft,
    position,
    placement,
    isActive,
    startsAt,
    expiresAt,
    createdAt,
  };
};

export const getBannerStatus = (banner, nowMs = Date.now()) => {
  if (!banner) return { code: "unknown", label: "Unknown" };
  if (banner.isActive === false) return { code: "inactive", label: "Inactive" };

  const startsMs = banner.startsAt ? Date.parse(banner.startsAt) : Number.NaN;
  if (Number.isFinite(startsMs) && startsMs > nowMs) {
    return { code: "scheduled", label: "Scheduled" };
  }

  const expiresMs = banner.expiresAt ? Date.parse(banner.expiresAt) : Number.NaN;
  if (Number.isFinite(expiresMs) && expiresMs <= nowMs) {
    return { code: "expired", label: "Expired" };
  }

  return { code: "live", label: "Live" };
};

export const isBannerVisibleNow = (banner, nowMs = Date.now()) => getBannerStatus(banner, nowMs).code === "live";

export const createBannerSearchText = (banner) =>
  [
    banner?.title,
    banner?.headingText,
    banner?.tag,
    banner?.description,
    banner?.href,
    banner?.ctaLabel,
    banner?.image,
    banner?.mobileImage,
    banner?.placement,
  ]
    .map((value) => toStringOrEmpty(value).trim())
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

export const sortBanners = (banners) => {
  const safe = Array.isArray(banners) ? banners.slice() : [];
  safe.sort((left, right) => {
    const leftPosition = left?.position;
    const rightPosition = right?.position;
    const leftHas = Number.isFinite(leftPosition);
    const rightHas = Number.isFinite(rightPosition);
    if (leftHas && rightHas && leftPosition !== rightPosition) return leftPosition - rightPosition;
    if (leftHas !== rightHas) return leftHas ? -1 : 1;

    const leftCreated = left?.createdAt ? Date.parse(left.createdAt) : Number.NaN;
    const rightCreated = right?.createdAt ? Date.parse(right.createdAt) : Number.NaN;
    if (Number.isFinite(leftCreated) && Number.isFinite(rightCreated) && leftCreated !== rightCreated) {
      return rightCreated - leftCreated;
    }

    return String(left?.id || "").localeCompare(String(right?.id || ""), "en", { sensitivity: "base" });
  });
  return safe;
};
