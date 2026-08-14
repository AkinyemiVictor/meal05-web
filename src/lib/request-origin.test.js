import assert from "node:assert/strict";
import { test } from "node:test";

import { isTrustedRequestOrigin } from "./api/request-origin.js";

test("origin guard permits origin-less safe reads in production", () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const request = new Request("https://meal05.com/api/wallet", { method: "GET" });
    assert.equal(isTrustedRequestOrigin(request), true);
  } finally {
    process.env.NODE_ENV = previous;
  }
});

test("origin guard keeps payment mutations restricted to a trusted origin", () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const missingOrigin = new Request("https://meal05.com/api/wallet/topups", { method: "POST" });
    const hostileOrigin = new Request("https://meal05.com/api/wallet/topups", {
      method: "POST",
      headers: { origin: "https://example.com", host: "meal05.com" },
    });
    const trustedOrigin = new Request("https://meal05.com/api/wallet/topups", {
      method: "POST",
      headers: { origin: "https://meal05.com", host: "meal05.com" },
    });

    assert.equal(isTrustedRequestOrigin(missingOrigin), false);
    assert.equal(isTrustedRequestOrigin(hostileOrigin), false);
    assert.equal(isTrustedRequestOrigin(trustedOrigin), true);
  } finally {
    process.env.NODE_ENV = previous;
  }
});
