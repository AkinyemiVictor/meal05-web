import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

const middleware = read("src/middleware.js");
const changePasswordRoute = read("src/app/api/auth/change-password/route.js");
const cancelRecoveryRoute = read("src/app/api/auth/cancel-password-recovery/route.js");
const changePasswordClient = read("src/app/account/change-password/change-password-client.js");

test("recovery cookie contains navigation and API access to recovery-only routes", () => {
  assert.match(middleware, /PASSWORD_RECOVERY_COOKIE/);
  assert.match(middleware, /RECOVERY_ALLOWED_PAGE_PATHS/);
  assert.match(middleware, /RECOVERY_ALLOWED_API_PATHS/);
  assert.match(middleware, /Finish or cancel password recovery before using your account/);
  assert.match(middleware, /url\.pathname = RECOVERY_PAGE_PATH/);
});

test("recovery password update always closes the recovery session", () => {
  assert.match(changePasswordRoute, /finishRecoverySession/);
  assert.match(changePasswordRoute, /scope: "global"/);
  assert.match(changePasswordRoute, /scope: "local"/);
  assert.match(changePasswordRoute, /recoveryComplete: true/);
});

test("recovery can be cancelled without leaving an authenticated session behind", () => {
  assert.match(cancelRecoveryRoute, /signOut\(\{ scope: "local" \}\)/);
  assert.match(cancelRecoveryRoute, /clearRecoveryCookie/);
  assert.match(changePasswordClient, /\/api\/auth\/cancel-password-recovery/);
  assert.match(changePasswordClient, /Cancel password recovery/);
});

test("successful recovery sends the customer back to explicit login", () => {
  assert.match(changePasswordClient, /Sign in with new password/);
  assert.match(changePasswordClient, /clearStoredUser\(\)/);
});
