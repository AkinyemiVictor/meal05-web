import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { buildAuthCallbackUrl, resolveAuthOrigin } from "./auth-redirect.js";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

test("auth redirects use the canonical production origin", () => {
  assert.equal(
    resolveAuthOrigin("https://www.meal05.com", "https://meal05.com"),
    "https://meal05.com"
  );
  assert.equal(
    buildAuthCallbackUrl({
      configuredSiteUrl: "https://meal05.com",
      currentOrigin: "https://www.meal05.com",
      next: "/account",
    }),
    "https://meal05.com/auth/callback?next=%2Faccount"
  );
});

test("auth redirects never replace a live production host with localhost", () => {
  assert.equal(
    resolveAuthOrigin("https://meal05.com", "http://localhost:3000"),
    "https://meal05.com"
  );
});

test("auth redirects preserve localhost during local development", () => {
  assert.equal(
    resolveAuthOrigin("http://localhost:3001", "https://meal05.com"),
    "http://localhost:3001"
  );
});

test("auth callback only accepts internal return paths", () => {
  assert.equal(
    buildAuthCallbackUrl({
      currentOrigin: "https://meal05.com",
      flow: "recovery",
      next: "https://example.com/steal-session",
    }),
    "https://meal05.com/auth/callback?flow=recovery"
  );
});

test("the requested auth tab is synchronized before it can rewrite the URL", () => {
  const signIn = read("src/app/sign-in/page.js");
  assert.match(signIn, /setIsLocationSynced\(true\)/);
  assert.match(signIn, /!isLocationSynced/);
});
