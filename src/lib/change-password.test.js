import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { getPasswordRequirements, isStrongPassword } from "./password-policy.js";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

test("shared password policy requires upper, lower, number, symbol, and eight characters", () => {
  assert.equal(isStrongPassword("Weakpassword1"), false);
  assert.equal(isStrongPassword("Short1!"), false);
  assert.equal(isStrongPassword("StrongPassword1!"), true);
  assert.equal(getPasswordRequirements("StrongPassword1!").every((item) => item.met), true);
});

test("account management links directly to the change-password page", () => {
  const account = read("src/app/account/page.js");
  assert.match(account, /href="\/account\/change-password">Change password/);
});

test("password changes verify the current password unless recovery is server-authorized", () => {
  const route = read("src/app/api/auth/change-password/route.js");

  assert.match(route, /isTrustedRequestOrigin/);
  assert.match(route, /checkRateLimit/);
  assert.match(route, /PASSWORD_RECOVERY_COOKIE/);
  assert.match(route, /verifyPasswordRecoveryToken\(recoveryToken, user\.id\)/);
  assert.match(route, /recovery && !recoveryAuthorized/);
  assert.match(route, /auth\.signInWithPassword/);
  assert.match(route, /auth\.updateUser\(\{ password: newPassword \}\)/);
  assert.match(route, /auth\.signOut\(\{ scope: "others" \}\)/);
  assert.match(route, /Cache-Control", "private, no-store/);
});

test("recovery links use the callback and receive a short-lived HttpOnly authorization", () => {
  const signIn = read("src/app/sign-in/page.js");
  const callback = read("src/app/auth/callback/route.js");
  const recovery = read("src/lib/auth/password-recovery.js");
  const token = read("src/lib/auth/password-recovery-token.js");

  assert.match(signIn, /buildAuthCallbackUrl/);
  assert.match(signIn, /flow: "recovery"/);
  assert.match(callback, /isRecentPasswordRecovery\(data\?\.user\)/);
  assert.match(callback, /httpOnly: true/);
  assert.match(callback, /PASSWORD_RECOVERY_MAX_AGE_SECONDS/);
  assert.match(recovery, /15 \* 60/);
  assert.match(token, /createHmac\("sha256"/);
  assert.match(token, /timingSafeEqual/);
  assert.match(token, /value\.userId === String\(expectedUserId/);
});

test("change-password UI supports current-password and recovery modes", () => {
  const page = read("src/app/account/change-password/change-password-client.js");

  assert.match(page, /autoComplete="current-password"/);
  assert.match(page, /autoComplete="new-password"/);
  assert.match(page, /recovery: recoveryAuthorized/);
  assert.match(page, /signOutOthers/);
  assert.match(page, /resetPasswordForEmail/);
});
