import assert from "node:assert/strict";
import test from "node:test";
import { buildWhatsappUrl, normalizePhoneContact } from "./phone-links.js";

test("normalizes Nigerian local phone numbers for calls and WhatsApp", () => {
  const contact = normalizePhoneContact("0811 828 7047");
  assert.deepEqual(contact, {
    displayPhone: "0811 828 7047",
    callUrl: "tel:+2348118287047",
    whatsappNumber: "2348118287047",
  });
});

test("normalizes Nigerian international phone numbers", () => {
  const contact = normalizePhoneContact("+234 811 828 7047");
  assert.equal(contact.displayPhone, "0811 828 7047");
  assert.equal(contact.callUrl, "tel:+2348118287047");
  assert.equal(contact.whatsappNumber, "2348118287047");
});

test("rejects placeholder and malformed phone values", () => {
  assert.equal(normalizePhoneContact("Not set"), null);
  assert.equal(normalizePhoneContact("00000000000"), null);
  assert.equal(normalizePhoneContact("12345"), null);
  assert.equal(normalizePhoneContact("+234 800"), null);
});

test("builds encoded WhatsApp URLs without exposing raw message spaces", () => {
  const url = buildWhatsappUrl("2348118287047", "Hello Meal05 rider");
  assert.equal(url, "https://wa.me/2348118287047?text=Hello%20Meal05%20rider");
});
