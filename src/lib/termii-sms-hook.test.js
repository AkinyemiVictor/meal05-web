import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const source = readFileSync(
  resolve(process.cwd(), "supabase/functions/send-sms-termii/index.ts"),
  "utf8",
);

test("Termii SMS hook verifies Supabase Standard Webhooks signatures", () => {
  assert.match(source, /standardwebhooks@1\.0\.0/);
  assert.match(source, /SEND_SMS_HOOK_SECRETS/);
  assert.match(source, /new Webhook\(secret\)\.verify\(payload, headers\)/);
  assert.match(source, /Invalid SMS hook signature/);
});

test("Termii only transports Supabase-generated six-digit OTPs", () => {
  assert.match(source, /event\?\.sms\?\.otp/);
  assert.match(source, /\^\\d\{6\}\$/);
  assert.match(source, /Your Meal05 verification code is \$\{otp\}/);
  assert.doesNotMatch(source, /api\/sms\/otp|token\/send|token\/verify/i);
});

test("Termii credentials stay in Edge Function secrets", () => {
  assert.match(source, /TERMII_API_KEY/);
  assert.match(source, /TERMII_BASE_URL/);
  assert.match(source, /TERMII_SENDER_ID/);
  assert.match(source, /TERMII_SMS_CHANNEL/);
  assert.doesNotMatch(source, /api_key:\s*["'][A-Za-z0-9_-]{12,}["']/);
});

test("OTP delivery uses Termii DND-compatible messaging API with retryable failures", () => {
  assert.match(source, /\/api\/sms\/send/);
  assert.match(source, /termiiChannel.*\|\| "dnd"/);
  assert.match(source, /type:\s*"plain"/);
  assert.match(source, /status:\s*503/);
  assert.match(source, /"retry-after": "2"/);
  assert.match(source, /TERMII_TIMEOUT_MS = 3500/);
});

test("Termii phone normalization accepts Supabase E.164 without leaking formatting", () => {
  assert.match(source, /replace\(\/\\D\/g, ""\)/);
  assert.match(source, /digits\.length === 11 && digits\.startsWith\("0"\)/);
  assert.match(source, /`234\$\{digits\.slice\(1\)\}`/);
});
