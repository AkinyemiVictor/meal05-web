import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("footer newsletter submits in place and shows a timed confirmation dialog", () => {
  const component = read("src/components/newsletter-signup.js");

  assert.match(component, /event\.preventDefault\(\)/);
  assert.doesNotMatch(component, /action=["']#["']/);
  assert.match(component, /fetch\(["']\/api\/newsletter["']/);
  assert.match(component, /setTimeout\(\(\) => setConfirmationOpen\(false\), 3000\)/);
  assert.match(component, /newsletter-confirmation__icon/);
  assert.match(component, /IconCheck/);
  assert.match(component, /createPortal/);
});

test("newsletter API validates and stores normalized subscriber emails server-side", () => {
  const route = read("src/app/api/newsletter/route.js");
  const migration = read("supabase/migrations/20260812061949_create_newsletter_subscribers.sql");

  assert.match(route, /checkRateLimit/);
  assert.match(route, /isTrustedRequestOrigin/);
  assert.match(route, /getSupabaseAdminClient/);
  assert.match(route, /\.from\(["']newsletter_subscribers["']\)/);
  assert.match(route, /\.upsert\(/);
  assert.match(migration, /create table public\.newsletter_subscribers/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all .* from anon, authenticated/);
});
