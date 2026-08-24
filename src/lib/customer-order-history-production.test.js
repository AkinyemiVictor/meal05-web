import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

const accountPage = read("src/app/account/page.js");
const ordersRoute = read("src/app/api/orders/route.js");

test("customer order history sends the verified browser session to the API", () => {
  assert.match(accountPage, /supabase\.auth\.getSession\(\)/);
  assert.match(accountPage, /Authorization: `Bearer \$\{accessToken\}`/);
});

test("customer order reads stay scoped to the verified user without a second cookie handoff", () => {
  assert.match(ordersRoute, /getVerifiedBearerUser\(request, admin\)/);
  assert.match(ordersRoute, /const user = bearerUser \|\| cookieUser \|\| null/);
  assert.match(
    ordersRoute,
    /const result = await admin[\s\S]*?\.from\("orders"\)[\s\S]*?\.eq\("user_id", user\.id\)/
  );
});

test("customer order failures are visible instead of rendering a false empty history", () => {
  assert.match(accountPage, /setOrdersStatus\("error"\)/);
  assert.match(accountPage, /Unable to load your orders\./);
  assert.match(accountPage, /Loading your orders\.\.\./);
  assert.match(accountPage, /Try again/);
});
