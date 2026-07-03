import { NextResponse } from 'next/server';
import { checkRateLimit, applyRateLimitHeaders } from './src/lib/api/rate-limit';

// Common security headers
const securityHeaders = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)',
  // HSTS only effective on HTTPS; safe to include
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
};

const buildCspRelaxed = () => {
  const style = "'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com";
  const script = "'self' 'unsafe-inline' 'unsafe-eval' https:";
  return [
    `default-src 'self' blob: data: https:`,
    `script-src ${script}`,
    `style-src ${style}`,
    `img-src 'self' data: blob: https:`,
    `connect-src 'self' https: wss:`,
    `font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ].join('; ');
};

// Strict policy tailored to current external resources (fonts only).
// - Allows Google Fonts styles + static fonts
// - Allows cdnjs font CSS + font files
// - No inline/eval for scripts; styles allow 'unsafe-inline' to support Next/font style tags
const buildCspStrict = (nonce) => [
  `default-src 'self'`,
  `script-src 'self' 'nonce-${nonce}'`,
  `style-src 'self' 'nonce-${nonce}' https://fonts.googleapis.com https://cdnjs.cloudflare.com`,
  `img-src 'self' data:`,
  `connect-src 'self' https: wss:`,
  `font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com`,
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `upgrade-insecure-requests`,
].join('; ');

const genNonce = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
};

export async function middleware(request) {
  const { pathname } = request.nextUrl || {};
  const isHealth = pathname === '/api/health';
  const url = request.nextUrl.clone();
  const host = request.headers.get('host') || '';
  const normalizedHost = host.toLowerCase().split(':')[0];

  if (normalizedHost === 'www.meal05.com') {
    url.hostname = 'meal05.com';
    url.port = '';
    return NextResponse.redirect(url, 308);
  }

  // Rate limit (skip health): 30 requests/10s per IP
  let rl = { allowed: true, remaining: 0, limit: 0, resetMs: 0 };
  if (!isHealth) {
    rl = await checkRateLimit({ request, id: 'global', limit: 30, windowMs: 10_000 });
    if (!rl.allowed) {
      const resp = NextResponse.json({ error: 'Too many requests' }, { status: 429 });
      return applyRateLimitHeaders(resp, rl);
    }
  }

  const nonce = genNonce();
  const reqHeaders = new Headers(request.headers);
  reqHeaders.set('x-nonce', nonce);
  // Region handling: map country hosts or prefixes to a cookie
  const resInit = { request: { headers: reqHeaders } };
  let response = NextResponse.next(resInit);

  const setRegionCookie = (code) => {
    response.cookies.set('mk_region', code, { path: '/', maxAge: 60 * 60 * 24 * 365 });
  };

  // 1) Host mapping (e.g., meal05.com.gh -> gh; meal05.com.ng -> ng)
  const h = host.toLowerCase();
  if (h.endsWith('.com.gh') || h.endsWith('.gh')) {
    setRegionCookie('gh');
  } else if (h.endsWith('.com.ng') || h.endsWith('.ng')) {
    setRegionCookie('ng');
  }

  // 2) Query override: ?region=gh|ng
  const queryRegion = url.searchParams.get('region');
  if (queryRegion === 'gh' || queryRegion === 'ng') {
    setRegionCookie(queryRegion);
    url.searchParams.delete('region');
    response = NextResponse.redirect(url);
  }

  // 3) Path prefix mapping: /gh/* or /ng/* — strip prefix and set cookie
  const seg = pathname.split('/')[1];
  if (seg === 'gh' || seg === 'ng') {
    const stripped = '/' + pathname.split('/').slice(2).join('/');
    url.pathname = stripped || '/';
    setRegionCookie(seg);
    response = NextResponse.redirect(url);
  }
  for (const [k, v] of Object.entries(securityHeaders)) {
    response.headers.set(k, v);
  }
  // CSP: relaxed always; if production and CSP_ENFORCE=true, set strict CSP; otherwise set strict CSP in Report-Only
  const relaxed = buildCspRelaxed();
  response.headers.set('Content-Security-Policy', relaxed);
  const strict = buildCspStrict(nonce);
  if (process.env.NODE_ENV === 'production') {
    if (process.env.CSP_ENFORCE === 'true') {
      response.headers.set('Content-Security-Policy', strict);
    } else {
      response.headers.set('Content-Security-Policy-Report-Only', strict);
    }
  }

  return applyRateLimitHeaders(response, rl);
}

export const config = {
  // Exclude Next internals, static assets, and files with extensions
  matcher: [
    '/((?!_next|static|favicon|assets|.*\\..*).*)',
  ],
};
