const normaliseHost = (value) => String(value || "").trim().toLowerCase();

const hostFromUrl = (value) => {
  try {
    return normaliseHost(new URL(String(value || "")).host);
  } catch {
    return "";
  }
};

const resolveRequestHost = (request) => {
  const forwarded = normaliseHost(request.headers.get("x-forwarded-host"));
  if (forwarded) return forwarded;
  return normaliseHost(request.headers.get("host"));
};

export const isTrustedRequestOrigin = (request) => {
  const originHost = hostFromUrl(request.headers.get("origin"));
  if (!originHost) {
    // Browsers usually send Origin for fetch/XHR. In local/dev tooling,
    // allow missing origin to avoid breaking manual smoke tests.
    return process.env.NODE_ENV !== "production";
  }

  const allowedHosts = new Set();
  const requestHost = resolveRequestHost(request);
  if (requestHost) allowedHosts.add(requestHost);

  const siteHost = hostFromUrl(process.env.NEXT_PUBLIC_SITE_URL);
  if (siteHost) allowedHosts.add(siteHost);

  return allowedHosts.has(originHost);
};

export const getBearerTokenFromRequest = (request) => {
  const header = request.headers.get("authorization") || request.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
};

export const getVerifiedBearerUser = async (request, adminClient) => {
  const token = getBearerTokenFromRequest(request);
  if (!token || !adminClient?.auth?.getUser) return null;

  try {
    const { data, error } = await adminClient.auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user;
  } catch {
    return null;
  }
};

export const getOriginTrustContext = async (request, adminClient) => {
  const bearerUser = await getVerifiedBearerUser(request, adminClient);
  return {
    trusted: Boolean(bearerUser) || isTrustedRequestOrigin(request),
    bearerUser,
  };
};
