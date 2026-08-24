import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

test("auth uses Login wording and preserves exact password input", () => {
  const page = read("src/app/sign-in/page.js");

  assert.match(page, /key: "login", label: "Login"/);
  assert.match(page, /isLoginSubmitting \? "Logging in\.\.\." : "Login"/);
  assert.match(page, /const password = String\(formData\.get\("login-password"\) \|\| ""\);/);
  assert.doesNotMatch(page, /formData\.get\("login-password"\)[^;]*\.trim\(\)/);
});

test("signup accepts normal email domains and does not require a phone number", () => {
  const page = read("src/app/sign-in/page.js");
  const phoneFieldStart = page.indexOf('id="signup-phone"');
  const phoneFieldEnd = page.indexOf("/>", phoneFieldStart);

  assert.match(page, /const EMAIL_PATTERN = "\[\^\\\\s@\]\+@\[\^\\\\s@\]\+\\\\\.\[\^\\\\s@\]\+"/);
  assert.match(page, /Phone number <span className="auth-label-optional">\(optional\)<\/span>/);
  assert.doesNotMatch(page.slice(phoneFieldStart, phoneFieldEnd), /\brequired\b/);
  assert.doesNotMatch(page, /fetch\("\/api\/verify-email"/);
});

test("tablet and mobile auth show only the full-size form", () => {
  const css = read("src/styles/sign-in.css");
  const responsive = css.slice(css.indexOf("@media (max-width: 900px)"));

  assert.match(responsive, /\.auth-aside\s*\{\s*display:\s*none;/);
  assert.doesNotMatch(responsive, /transform:\s*scale\(/);
  assert.match(responsive, /min-height:\s*100dvh/);
});

test("product pages do not render the customer review comments section", () => {
  const page = read("src/app/products/[productSlug]/page.js");

  assert.doesNotMatch(page, /CustomerReviewsSection/);
  assert.doesNotMatch(page, />Customer reviews</);
  assert.doesNotMatch(page, /product-review-comment/);
});

test("app preview mockups bypass stale image-optimizer output without restricting other local images", () => {
  const section = read("src/components/app-coming-soon-section.js");
  const config = read("next.config.mjs");

  assert.match(section, /iphone mockup potrait\.png[\s\S]*?unoptimized/);
  assert.match(section, /android mockup potrait\.png[\s\S]*?unoptimized/);
  assert.doesNotMatch(config, /localPatterns/);
});
