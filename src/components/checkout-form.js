"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import copy from "@/data/copy";
import {
  applyStoredPromoToSummary,
  clearStoredPromo,
  clearStoredCart,
  computeCartSummary,
  dispatchCheckoutCompletedEvent,
  generateOrderId,
  persistCheckoutReceipt,
  readStoredPromo,
  readStoredCart,
  writeStoredCart,
} from "@/lib/checkout";
import { formatProductPrice } from "@/lib/catalogue";
import { AUTH_EVENT, persistStoredUser, readStoredUser } from "@/lib/auth";
import { addUserOrder } from "@/lib/orders";
import { trackPurchase } from "@/lib/analytics";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser-client";
import {
  buildCityServiceMessage,
  buildSameDayDeliveryNotice,
  findMatchingServiceZone,
  getDeliverySummaryConfig,
  normalizeServiceZoneFees,
} from "@/lib/delivery-settings";

const INITIAL_FORM_STATE = {
  fullName: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  deliverySlot: "morning",
  paymentMethod: "paystack",
  cardName: "",
  cardNumber: "",
  cardExpiry: "",
  cardCvc: "",
  notes: "",
};

const PAYMENT_METHOD_LABELS = copy.checkout.paymentMethods.reduce((accumulator, method) => {
  accumulator[method.value] = method.title;
  return accumulator;
}, {});

const ENABLE_PALMPAY = process.env.NEXT_PUBLIC_ENABLE_PALMPAY === "true";
const ENABLE_OPAY = process.env.NEXT_PUBLIC_ENABLE_OPAY === "true";

const isPaymentMethodEnabled = (method, paystackKey = "") => {
  if (method === "paystack") return /^pk_(test|live)_/.test(paystackKey || "");
  if (method === "palmpay") return ENABLE_PALMPAY;
  if (method === "opay") return ENABLE_OPAY;
  return true;
};

const DELIVERY_SLOT_LABELS = { ...copy.checkout.deliverySlots };

const CARD_FIELDS = ["cardName", "cardNumber", "cardExpiry", "cardCvc"];

const NAME_PATTERN = "[A-Za-z ]+";
const EMAIL_PATTERN = "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}";
const PHONE_PATTERN = "\\+?[0-9]{10,15}";
const ADDRESS_MIN_LENGTH = 10;
const ADDRESS_PATTERN = "[A-Za-z0-9.,'\\-\\s]{10,}";
const createAddressId = () => `addr_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 6)}`;

const NAME_REGEX = new RegExp(`^${NAME_PATTERN}$`);
const EMAIL_REGEX = new RegExp(`^${EMAIL_PATTERN}$`);
const PHONE_REGEX = new RegExp(`^${PHONE_PATTERN}$`);

const expiryPattern = /^(0[1-9]|1[0-2])\/\d{2}$/;

const resolveCitySelection = (value, defaultServiceCity, serviceZoneOptions, deliverySettings) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return defaultServiceCity;
  if (serviceZoneOptions.includes(trimmed)) return trimmed;
  const match = findMatchingServiceZone(trimmed, deliverySettings);
  if (match && serviceZoneOptions.includes(match)) return match;
  return defaultServiceCity;
};

const createInitialFormState = (user) => ({
  ...INITIAL_FORM_STATE,
  fullName: user?.fullName ?? "",
  email: user?.email ?? "",
  phone: user?.phone ?? "",
  address: user?.address ?? "",
  city: user?.city ?? "",
});

const normalizeSavedAddresses = (user, defaultCity) => {
  if (!user) return [];
  const seen = new Set();
  const addresses = [];
  const addEntry = (entry) => {
    const line = (entry?.line || entry?.address || "").trim();
    if (!line) return;
    const key = line.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    addresses.push({
      id: entry.id || createAddressId(),
      label: entry.label || entry.title || "Saved address",
      line,
      city: (entry.city || defaultCity).trim() || defaultCity,
      createdAt: entry.createdAt || new Date().toISOString(),
    });
  };
  if (Array.isArray(user.addresses)) {
    user.addresses.forEach(addEntry);
  }
  const legacy = typeof user.address === "string" ? user.address.trim() : "";
  if (legacy) {
    addEntry({
      id: user.defaultAddressId || createAddressId(),
      label: "Default address",
      line: legacy,
      city: user.city || defaultCity,
    });
  }
  return addresses;
};

const formatCardNumber = (value) => {
  const digitsOnly = value.replace(/\D/g, "").slice(0, 16);
  return digitsOnly.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
};

const formatCardExpiry = (value) => {
  const digitsOnly = value.replace(/\D/g, "").slice(0, 4);
  if (digitsOnly.length <= 2) return digitsOnly;
  return `${digitsOnly.slice(0, 2)}/${digitsOnly.slice(2)}`;
};

const formatCardCvc = (value) => value.replace(/\D/g, "").slice(0, 3);

const deriveFirstName = (fullName) => {
  const trimmed = String(fullName || "").trim();
  if (!trimmed) return "friend";
  const [first] = trimmed.split(/\s+/);
  return first || "friend";
};

const getDeliverySlotLabel = (slot) => DELIVERY_SLOT_LABELS[slot] ?? slot;

const getPaymentMethodLabel = (method) => PAYMENT_METHOD_LABELS[method] ?? method;

function CheckoutConfirmation({ order }) {
  const firstName = deriveFirstName(order.fullName);
  const successTitle = copy.checkout.status.successTitle(firstName);
  const successSubtitle = copy.checkout.status.successSubtitle?.(order.email);
  const deliverySlot = getDeliverySlotLabel(order.deliverySlot);
  const paymentLabel = getPaymentMethodLabel(order.paymentMethod);
  const totalFormatted = formatProductPrice(order.summary?.total ?? 0);
  const bankSubtitle = copy.checkout.status.bankInstructionsSubtitle?.(totalFormatted);
  const items = Array.isArray(order.items) ? order.items : [];

  return (
    <section className="checkout-card checkout-confirmation" role="status" aria-live="polite">
      <div className="checkout-confirmation__header">
        <div>
          <h2>{successTitle}</h2>
          {successSubtitle ? <p>{successSubtitle}</p> : null}
        </div>
      </div>

      <dl className="checkout-confirmation__details">
        <div>
          <dt>{copy.checkout.confirmation.orderIdLabel}</dt>
          <dd>{order.orderId}</dd>
        </div>
        <div>
          <dt>{copy.checkout.confirmation.deliverySlotLabel}</dt>
          <dd>{deliverySlot}</dd>
        </div>
        <div>
          <dt>{copy.checkout.confirmation.paymentMethodLabel}</dt>
          <dd>{paymentLabel}</dd>
        </div>
        <div>
          <dt>{copy.checkout.confirmation.totalLabel}</dt>
          <dd>{totalFormatted}</dd>
        </div>
      </dl>

      {items.length ? (
        <div className="checkout-confirmation__items">
          <h3>{copy.checkout.confirmation.itemsHeading}</h3>
          <ul>
            {items.map((item, index) => {
              const key = item?.id != null ? String(item.id) : `${item?.name ?? "item"}-${index}`;
              const quantity = Number(item?.quantity) || Number(item?.orderCount) || Number(item?.orderSize) || 1;
              return (
                <li key={key}>
                  <span>{item?.name ?? "Fresh produce"}</span>
                  <span>{`x${quantity.toLocaleString()}`}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {order.paymentMethod === "bank" && !order.isOnlinePaid ? (
        <div className="checkout-confirmation__notice">
          <h3>{copy.checkout.status.bankInstructionsTitle}</h3>
          {bankSubtitle ? <p>{bankSubtitle}</p> : null}
          <ul className="checkout-confirmation__account">
            <li>
              <span>Account name</span>
              <span>{copy.checkout.bankAccount.name}</span>
            </li>
            <li>
              <span>Account number</span>
              <span>{copy.checkout.bankAccount.number}</span>
            </li>
            <li>
              <span>Bank</span>
              <span>{copy.checkout.bankAccount.bank}</span>
            </li>
          </ul>
        </div>
      ) : null}

      {order.paymentMethod === "delivery" ? (
        <div className="checkout-confirmation__notice">
          <h3>{copy.checkout.status.deliveryInstructionsTitle}</h3>
          <p>{copy.checkout.status.deliveryInstructionsSubtitle}</p>
        </div>
      ) : null}

      {(order.paymentMethod === "palmpay" || order.paymentMethod === "opay") && !order.isOnlinePaid ? (
        <div className="checkout-confirmation__notice">
          <h3>{copy.checkout.status.walletInstructionsTitle}</h3>
          <p>{copy.checkout.status.walletInstructionsSubtitle}</p>
        </div>
      ) : null}

      <div className="checkout-confirmation__actions">
        <Link href="/checkout/success" className="checkout-confirmation__action">
          {copy.checkout.receiptPage.viewReceipt}
        </Link>
        <Link href="/shop" className="checkout-confirmation__action checkout-confirmation__action--secondary">
          {copy.checkout.emptyCta}
        </Link>
        <Link href="/categories" className="checkout-confirmation__action checkout-confirmation__action--secondary">
          {copy.general.seeAll}
        </Link>
      </div>
    </section>
  );
}

export default function CheckoutForm({ deliverySettings, onCityChange }) {
  const formRef = useRef(null);
  const submitFeedbackRef = useRef(null);
  const [formState, setFormState] = useState(() =>
    createInitialFormState(typeof window !== "undefined" ? readStoredUser() : null)
  );
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [status, setStatus] = useState("idle");
  const [result, setResult] = useState(null);
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [savedDefaultAddressId, setSavedDefaultAddressId] = useState("");
  const [selectedSavedAddressId, setSelectedSavedAddressId] = useState("");
  const [overlayStatus, setOverlayStatus] = useState(null); // "success" | "failure" | null
  const [overlayMessage, setOverlayMessage] = useState("");
  const deliverySummaryConfig = useMemo(
    () => getDeliverySummaryConfig(deliverySettings, formState.city),
    [deliverySettings, formState.city]
  );
  const serviceZoneOptions = useMemo(() => {
    const zones = normalizeServiceZoneFees(
      deliverySettings?.serviceZoneFees ?? deliverySettings?.serviceZones,
      deliverySettings?.deliveryFee
    );
    return zones.map((zone) => zone.name).filter(Boolean);
  }, [deliverySettings]);
  const defaultServiceCity = useMemo(
    () => serviceZoneOptions[0] || "Ibadan",
    [serviceZoneOptions]
  );
  const cityServiceMessage = useMemo(() => buildCityServiceMessage(deliverySettings), [deliverySettings]);
  const sameDayNotice = useMemo(() => buildSameDayDeliveryNotice(deliverySettings), [deliverySettings]);

  useEffect(() => {
    if (!serviceZoneOptions.length) return;
    setFormState((prev) => {
      const nextCity = resolveCitySelection(prev.city, defaultServiceCity, serviceZoneOptions, deliverySettings);
      if (nextCity === prev.city) return prev;
      return { ...prev, city: nextCity };
    });
  }, [defaultServiceCity, deliverySettings, serviceZoneOptions]);

  useEffect(() => {
    if (typeof onCityChange === "function") {
      onCityChange(formState.city);
    }
  }, [formState.city, onCityChange]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = readStoredUser();
    if (!stored) return;
    setFormState((prev) => {
      let changed = false;
      const next = { ...prev };
      if (!prev.fullName && stored.fullName) {
        next.fullName = stored.fullName;
        changed = true;
      }
      if (!prev.email && stored.email) {
        next.email = stored.email;
        changed = true;
      }
      if (!prev.phone && stored.phone) {
        next.phone = stored.phone;
        changed = true;
      }
      if (!prev.address && stored.address) {
        next.address = stored.address;
        changed = true;
      }
      if (!prev.city && stored.city) {
        next.city = stored.city;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncAddresses = (source) => {
      const normalized = normalizeSavedAddresses(source, defaultServiceCity);
      setSavedAddresses(normalized);
      const defaultId =
        (source?.defaultAddressId && normalized.some((addr) => addr.id === source.defaultAddressId))
          ? source.defaultAddressId
          : normalized[0]?.id || "";
      setSavedDefaultAddressId(defaultId);
      setSelectedSavedAddressId(defaultId);
      if (defaultId) {
        const match = normalized.find((addr) => addr.id === defaultId);
        if (match) {
          setFormState((prev) => {
            if (prev.address) return prev;
            return {
              ...prev,
              address: match.line,
              city: resolveCitySelection(match.city || defaultServiceCity, defaultServiceCity, serviceZoneOptions, deliverySettings),
            };
          });
        }
      }
    };
    const initial = readStoredUser();
    syncAddresses(initial);
    const handleAuthChange = (event) => {
      syncAddresses(event?.detail?.user ?? readStoredUser());
    };
    window.addEventListener(AUTH_EVENT, handleAuthChange);
    return () => {
      window.removeEventListener(AUTH_EVENT, handleAuthChange);
    };
  }, [defaultServiceCity, deliverySettings, serviceZoneOptions]);

  // We use Paystack for all online payments; never collect raw card details in our UI.
  const paystackKey = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || "";
  const showCardFields = false;
  const isProcessing = status === "processing";
  const enabledPaymentMethods = useMemo(
    () => copy.checkout.paymentMethods.filter((method) => isPaymentMethodEnabled(method.value, paystackKey)),
    [paystackKey]
  );

  useEffect(() => {
    if (!enabledPaymentMethods.length) return;
    if (enabledPaymentMethods.some((method) => method.value === formState.paymentMethod)) return;
    setFormState((prev) => ({ ...prev, paymentMethod: enabledPaymentMethods[0].value }));
  }, [enabledPaymentMethods, formState.paymentMethod]);

  const scrollToSubmitFeedback = () => {
    if (typeof window === "undefined") return;
    requestAnimationFrame(() => {
      const target = submitFeedbackRef.current;
      if (!target || typeof target.scrollIntoView !== "function") return;
      try {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch {
        target.scrollIntoView();
      }
    });
  };
  const normalizeCheckoutErrorMessage = (message) => {
    const raw = String(message || "").trim();
    const lower = raw.toLowerCase();
    if (!raw) return "Payment was not completed";
    if (lower.includes("authentication method missing")) {
      return "Please choose a payment method and try placing your order again.";
    }
    if (lower.includes("not authenticated") || lower.includes("auth session missing")) {
      return "Your login session has expired. Please sign in again, then complete checkout.";
    }
    return raw;
  };
  const showSubmitError = (message) => {
    setFormError(normalizeCheckoutErrorMessage(message));
    scrollToSubmitFeedback();
  };

  const paymentHint = useMemo(() => copy.checkout.paymentHint, []);

  const handleChange = (event) => {
    const { name } = event.target;
    let { value } = event.target;

    let nextValue = value;

    if (name === "cardNumber") {
      nextValue = formatCardNumber(value);
    } else if (name === "cardExpiry") {
      nextValue = formatCardExpiry(value);
    } else if (name === "cardCvc") {
      nextValue = formatCardCvc(value);
    } else if (name === "address") {
      nextValue = value.replace(/\s{2,}/g, " ");
    } else {
      if (name === "fullName") {
        nextValue = value.replace(/[^A-Za-z\s]/g, "").replace(/\s+/g, " ");
      } else if (name === "email") {
        nextValue = value.replace(/\s+/g, "");
      } else if (name === "phone") {
        const stripped = value.replace(/[^0-9+]/g, "");
        const startsWithPlus = stripped.startsWith("+");
        const digitsOnly = stripped.replace(/\D/g, "").slice(0, 15);
        nextValue = startsWithPlus ? `+${digitsOnly}` : digitsOnly;
      }
    }

    setFormState((prev) => ({ ...prev, [name]: nextValue }));

    setErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });

    if (name === "paymentMethod") {
      setErrors((prev) => {
        if (!Object.keys(prev).length) return prev;
        const next = { ...prev };
        CARD_FIELDS.forEach((field) => { delete next[field]; });
        return next;
      });
    }
  };

  const handleSelectSavedAddress = (id) => {
    setSelectedSavedAddressId(id);
    const match = savedAddresses.find((addr) => addr.id === id);
    if (!match) return;
    setFormState((prev) => ({
      ...prev,
      address: match.line,
      city: resolveCitySelection(match.city || defaultServiceCity, defaultServiceCity, serviceZoneOptions, deliverySettings),
    }));
    setErrors((prev) => {
      if (!prev.address && !prev.city) return prev;
      const next = { ...prev };
      delete next.address;
      delete next.city;
      return next;
    });
  };

  const validateForm = (state) => {
    const validation = copy.checkout.validation;
    const nextErrors = {};

    const trimmedName = state.fullName.trim();
    if (!trimmedName) {
      nextErrors.fullName = validation.required;
    } else if (!NAME_REGEX.test(trimmedName)) {
      nextErrors.fullName = validation.name ?? validation.required;
    }

    const normalizedEmail = state.email.trim().toLowerCase();
    if (!normalizedEmail) {
      nextErrors.email = validation.required;
    } else if (!EMAIL_REGEX.test(normalizedEmail)) {
      nextErrors.email = validation.email;
    }

    const normalizedPhone = state.phone.trim();
    const phoneDigits = normalizedPhone.replace(/\s+/g, "");
    if (!phoneDigits) {
      nextErrors.phone = validation.required;
    } else if (!PHONE_REGEX.test(phoneDigits)) {
      nextErrors.phone = validation.phone;
    }
    const addressTrimmed = state.address.trim();
    if (!addressTrimmed) {
      nextErrors.address = validation.required;
    } else if (addressTrimmed.length < ADDRESS_MIN_LENGTH) {
      nextErrors.address = validation.addressLength ?? validation.required;
    }
    const cityTrimmed = state.city.trim();
    if (!cityTrimmed) {
      nextErrors.city = validation.required;
    } else if (!findMatchingServiceZone(cityTrimmed, deliverySettings)) {
      nextErrors.city = cityServiceMessage || validation.required;
    }

    if (showCardFields) {
      if (!state.cardName.trim()) {
        nextErrors.cardName = validation.required;
      }
      const digits = state.cardNumber.replace(/\D/g, "");
      if (digits.length !== 16) {
        nextErrors.cardNumber = validation.cardNumber;
      }
      if (!expiryPattern.test(state.cardExpiry)) {
        nextErrors.cardExpiry = validation.cardExpiry;
      }
      if (state.cardCvc.replace(/\D/g, "").length !== 3) {
        nextErrors.cardCvc = validation.cardCvc;
      }
    }

    return nextErrors;
  };

  const ensurePaystackScript = () => {
    return new Promise((resolve) => {
      if (typeof window === "undefined") return resolve(false);
      if (window.PaystackPop) return resolve(true);
      const script = document.createElement("script");
      script.src = "https://js.paystack.co/v1/inline.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const getCheckoutAuthToken = async () => {
    try {
      const supabase = getBrowserSupabaseClient();
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      return token ? String(token) : "";
    } catch {
      return "";
    }
  };

  const buildCheckoutRequestHeaders = (token) => {
    const headers = { "Content-Type": "application/json" };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  };

  const createPaystackSession = async (orderId, authToken = "") => {
    if (!orderId) throw new Error("Missing order for payment session");
    const res = await fetch("/api/paystack/session", {
      method: "POST",
      headers: buildCheckoutRequestHeaders(authToken),
      cache: "no-store",
      body: JSON.stringify({ orderId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.reference) {
      throw new Error(data?.error || "Unable to prepare secure payment session");
    }
    return data;
  };

  const markOrderPaymentFailed = async (orderId, authToken = "", reason = "") => {
    if (!orderId) return;
    try {
      await fetch("/api/orders/payment-failed", {
        method: "POST",
        headers: buildCheckoutRequestHeaders(authToken),
        cache: "no-store",
        body: JSON.stringify({ orderId, reason }),
      });
    } catch (_) {}
  };

  const launchPaystack = async ({ email, amount, amountKobo, orderId, reference, channels }) => {
    const ready = await ensurePaystackScript();
    if (!ready || !window.PaystackPop) throw new Error("Paystack failed to load");
    return new Promise((resolve, reject) => {
      const payableKobo = Number.isFinite(Number(amountKobo))
        ? Math.max(0, Math.round(Number(amountKobo)))
        : Math.max(0, Math.round(Number(amount) * 100));
      const handler = window.PaystackPop.setup({
        key: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY,
        email,
        amount: payableKobo,
        ref: reference || `MK-${orderId || generateOrderId()}-${Date.now()}`,
        metadata: orderId ? { orderId: String(orderId) } : undefined,
        ...(Array.isArray(channels) && channels.length ? { channels } : {}),
        // Use non-async function to satisfy inline.js validator
        callback: function (response) {
          fetch("/api/paystack/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reference: response.reference, orderId }),
          })
            .then((res) => res.json().then((json) => ({ ok: res.ok, json })))
            .then(({ ok, json }) => {
              if (!ok || !json?.verified) throw new Error(json?.error || "Verification failed");
              resolve(json);
            })
            .catch((e) => reject(e));
        },
        onClose: function () {
          reject(new Error("Payment window closed"));
        },
      });
      handler.openIframe();
    });
  };

  const launchPalmPay = async ({ amount, orderId }) => {
    const ref = `MK-${orderId || generateOrderId()}-${Date.now()}`;
    const url = `https://palmpay.app/pay?ref=${encodeURIComponent(ref)}&amount=${encodeURIComponent(
      Math.max(0, Math.round(Number(amount)))
    )}`;
    try { window.open(url, "_blank"); } catch (_) {}
  };

  const launchOpay = async ({ amount, orderId }) => {
    const ref = `MK-${orderId || generateOrderId()}-${Date.now()}`;
    const url = `https://pay.opayweb.com/?ref=${encodeURIComponent(ref)}&amount=${encodeURIComponent(
      Math.max(0, Math.round(Number(amount)))
    )}`;
    try { window.open(url, "_blank"); } catch (_) {}
  };

  const getCheckoutIssues = (payload) => {
    if (Array.isArray(payload?.issues) && payload.issues.length) {
      return payload.issues.filter(Boolean);
    }
    return payload && typeof payload === "object" ? [payload] : [];
  };

  const isOutOfStockIssue = (issue) => {
    const availableNumber = Number(issue?.available);
    return Number.isFinite(availableNumber) && availableNumber <= 0;
  };

  const hasStockIssue = (payload) =>
    getCheckoutIssues(payload).some((issue) => Number.isFinite(Number(issue?.available)));

  const removeOutOfStockItemsFromCart = (payload) => {
    const outOfStockIssues = getCheckoutIssues(payload).filter(isOutOfStockIssue);
    if (!outOfStockIssues.length) return false;

    const targets = outOfStockIssues
      .map((issue) => {
        const variantKey = String(
          issue?.variantId ?? issue?.variant_id ?? issue?.variant?.id ?? ""
        ).trim();
        const productKey = String(
          issue?.productId ?? issue?.product_id ?? issue?.id ?? issue?.product?.id ?? ""
        ).trim();
        const labelCandidate = [
          issue?.variant_name,
          issue?.variantName,
          issue?.product_name,
          issue?.product,
          issue?.name,
        ].find((value) => typeof value === "string" && value.trim());
        const labelKey = String(labelCandidate || "").trim().toLowerCase();
        if (!variantKey && !productKey && !labelKey) return null;
        return { variantKey, productKey, labelKey };
      })
      .filter(Boolean);

    if (!targets.length) return false;

    const currentCart = readStoredCart();
    if (!Array.isArray(currentCart) || !currentCart.length) return false;

    const nextCart = currentCart.filter((item) => {
      const itemVariantKey = String(item?.variantId ?? "").trim();
      const itemProductKey = String(item?.productId ?? item?.id ?? "").trim();
      const itemNameKey = String(item?.name ?? "").trim().toLowerCase();
      const itemVariantNameKey = String(item?.variantName ?? "").trim().toLowerCase();

      const matched = targets.some((target) => {
        if (target.variantKey) {
          return itemVariantKey && itemVariantKey === target.variantKey;
        }
        if (target.productKey) {
          return itemProductKey && itemProductKey === target.productKey;
        }
        if (target.labelKey) {
          return target.labelKey === itemNameKey || target.labelKey === itemVariantNameKey;
        }
        return false;
      });

      return !matched;
    });

    if (nextCart.length === currentCart.length) return false;
    writeStoredCart(nextCart);
    return true;
  };

  const formatStockError = (payload, { removedFromCart = false } = {}) => {
    const issue = getCheckoutIssues(payload)[0] || payload;
    const available = issue?.available;
    const availableNumber = Number(available);
    const labelCandidate = [
      issue?.product_name,
      issue?.product,
      issue?.variant_name,
      issue?.variantName,
      issue?.name,
    ].find((value) => typeof value === "string" && value.trim());
    const label = labelCandidate ? ` for ${String(labelCandidate).trim()}` : "";
    if (Number.isFinite(availableNumber) && availableNumber <= 0) {
      return removedFromCart
        ? `Item${label} is out of stock and has been removed from cart.`
        : `Item${label} is out of stock. Remove item from cart.`;
    }
    if (Number.isFinite(availableNumber)) {
      return `Only ${availableNumber} left in stock${label}. Reduce quantity.`;
    }
    return payload?.error || "Unable to create order.";
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isProcessing) return;

    const fieldErrors = validateForm(formState);
    if (Object.keys(fieldErrors).length) {
      setErrors(fieldErrors);
      setFormError(null);

      // Improve UX: scroll to the first invalid field and focus it
      try {
        const order = ["fullName", "email", "phone", "address", "city", ...CARD_FIELDS];
        const firstInvalid = order.find((key) => fieldErrors[key]);
        const formEl = formRef.current;
        if (formEl && firstInvalid) {
          // Defer to next frame so error styles are applied before scrolling
          requestAnimationFrame(() => {
            const inputEl = formEl.querySelector(`[name="${firstInvalid}"]`);
            const errorEl =
              formEl.querySelector(`#checkout-${firstInvalid}-error`) ||
              (firstInvalid === "city" ? formEl.querySelector("#checkout-city-service-alert") : null);
            const scrollTarget = errorEl || inputEl;
            if (scrollTarget && typeof scrollTarget.scrollIntoView === "function") {
              try {
                scrollTarget.scrollIntoView({ behavior: "smooth", block: "center" });
              } catch (_) {
                // no-op if smooth scrolling not supported
                scrollTarget.scrollIntoView();
              }
            }
            if (inputEl && typeof inputEl.focus === "function") {
              try { inputEl.focus({ preventScroll: true }); } catch (_) { inputEl.focus(); }
            }
          });
        } else if (formEl) {
          // Fallback: find any element flagged invalid in DOM order
          requestAnimationFrame(() => {
            const fallback = formEl.querySelector(
              '[aria-invalid="true"], .has-error input, .has-error textarea, .has-error select'
            );
            if (fallback && typeof fallback.scrollIntoView === "function") {
              try {
                fallback.scrollIntoView({ behavior: "smooth", block: "center" });
              } catch (_) {
                fallback.scrollIntoView();
              }
              if (typeof fallback.focus === "function") {
                try { fallback.focus({ preventScroll: true }); } catch (_) { fallback.focus(); }
              }
            }
          });
        }
      } catch (_) {}
      return;
    }

    const cartItems = readStoredCart();
    if (!cartItems.length) {
      showSubmitError(copy.checkout.emptyDescription);
      return;
    }
    if (!isPaymentMethodEnabled(formState.paymentMethod, paystackKey)) {
      showSubmitError("That payment method is not available right now. Please choose another option.");
      return;
    }
    const checkoutItemsPayload = cartItems
      .map((item) => {
        const productId = item?.productId ?? item?.id ?? null;
        const variantId = item?.variantId ?? null;
        const quantity = Number(item?.quantity) || Number(item?.orderCount) || 1;
        return {
          product_id: productId != null ? String(productId) : null,
          variant_id: variantId != null ? String(variantId) : null,
          quantity: Number.isFinite(quantity) && quantity > 0 ? Math.round(quantity) : 1,
          unit_price_at_add: Number.isFinite(Number(item?.price)) ? Number(item.price) : undefined,
          variant_name: item?.variantName || undefined,
          product_name: item?.name || undefined,
        };
      })
      .filter((item) => item.product_id || item.variant_id);

    setErrors({});
    setFormError(null);

    const baseSummary = computeCartSummary(cartItems, {
      freeDeliveryThreshold: deliverySummaryConfig.freeDeliveryThreshold,
      deliveryFee: deliverySummaryConfig.deliveryFee,
    });
    const summary = applyStoredPromoToSummary(baseSummary, readStoredPromo());

    const status =
      formState.paymentMethod === "delivery"
        ? "awaiting delivery"
        : formState.paymentMethod === "palmpay" || formState.paymentMethod === "opay"
          ? "awaiting payment"
          : "processing";
    const storedUser = readStoredUser();

    const cityTrimmed = formState.city.trim();
    const matchedServiceZone = findMatchingServiceZone(cityTrimmed, deliverySettings);
    const canonicalCity = matchedServiceZone
      ? resolveCitySelection(cityTrimmed, defaultServiceCity, serviceZoneOptions, deliverySettings)
      : "";

    const normalizedForm = {
      ...formState,
      fullName: formState.fullName.trim(),
      email: formState.email.trim().toLowerCase(),
      phone: formState.phone.trim().replace(/\s+/g, ""),
      address: formState.address.trim(),
      city: canonicalCity,
      notes: formState.notes.trim(),
      cardName: formState.cardName.trim(),
      cardExpiry: formState.cardExpiry.trim(),
    };

    let nextUserRecord = storedUser;
    if (normalizedForm.email) {
      const base = storedUser ?? {};
      const baseAddresses = normalizeSavedAddresses(base, defaultServiceCity);
      let nextAddresses = baseAddresses;
      let defaultAddressId =
        base.defaultAddressId && baseAddresses.some((addr) => addr.id === base.defaultAddressId)
          ? base.defaultAddressId
          : baseAddresses[0]?.id || null;

      if (normalizedForm.address) {
        const matchIndex = baseAddresses.findIndex(
          (addr) => addr.line.toLowerCase() === normalizedForm.address.toLowerCase()
        );
        if (matchIndex !== -1) {
          const existing = baseAddresses[matchIndex];
          nextAddresses = baseAddresses.map((addr, index) =>
            index === matchIndex
              ? { ...existing, line: normalizedForm.address, city: canonicalCity || existing.city || defaultServiceCity }
              : addr
          );
          defaultAddressId = existing.id;
        } else {
          const entry = {
            id: createAddressId(),
            label: "Checkout address",
            line: normalizedForm.address,
            city: canonicalCity || defaultServiceCity,
            createdAt: new Date().toISOString(),
          };
          nextAddresses = [entry, ...baseAddresses];
          defaultAddressId = entry.id;
        }
      }

      nextUserRecord = {
        ...base,
        fullName: normalizedForm.fullName || base.fullName || "",
        email: normalizedForm.email,
        phone: normalizedForm.phone || base.phone || "",
        address: normalizedForm.address || base.address || "",
        city: canonicalCity || base.city || "",
        addresses: nextAddresses,
        defaultAddressId: defaultAddressId || undefined,
      };
      persistStoredUser(nextUserRecord);
    }

    const order = {
      ...normalizedForm,
      orderId: generateOrderId(),
      items: cartItems,
      summary,
      createdAt: new Date().toISOString(),
      status,
      user: nextUserRecord
        ? {
            name: nextUserRecord.fullName || nextUserRecord.email,
            email: nextUserRecord.email,
            phone: nextUserRecord.phone,
            address: nextUserRecord.address,
          }
        : null,
    };

    const finalize = async (serverOrderId, serverPayload = null) => {
      // Attempt to create server order (requires Supabase session)
      if (!serverOrderId) {
        const res = await fetch("/api/orders", {
          method: "POST",
          headers: buildCheckoutRequestHeaders(authToken),
          cache: "no-store",
          body: JSON.stringify({
            deliveryAddress: order.address,
            deliveryCity: canonicalCity,
            note: order.notes,
            paymentMethod: order.paymentMethod,
            promo_code: summary.promoCode || undefined,
            items: checkoutItemsPayload,
          }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          const removedFromCart = removeOutOfStockItemsFromCart(payload);
          if (removedFromCart || hasStockIssue(payload)) {
            throw new Error(formatStockError(payload, { removedFromCart }));
          }
          throw new Error(payload?.error || res.statusText || "Unable to create order.");
        }
        serverOrderId = payload?.order?.id || null;
        serverPayload = payload;
      }

      if (!serverOrderId) {
        throw new Error("Unable to create order. Please try again.");
      }

      const serverSummary = serverPayload?.summary || summary;
      const finalOrder = {
        ...order,
        orderId: String(serverOrderId || order.orderId || ""),
        summary: serverSummary,
        promoCode: serverSummary?.promoCode || "",
      };

      persistCheckoutReceipt(finalOrder);
      clearStoredCart();
      clearStoredPromo();
      addUserOrder(finalOrder, status, nextUserRecord);
      dispatchCheckoutCompletedEvent({ items: cartItems, summary: serverSummary, order: finalOrder });
      trackPurchase({
        transactionId: String(serverOrderId || finalOrder.orderId || ""),
        items: cartItems,
        value: serverSummary.total,
        shipping: serverSummary.deliveryFee,
        coupon: serverSummary.promoCode || "",
        paymentType: order.paymentMethod,
      });
      // Fire-and-forget email receipt; do not block UI
      try {
        fetch("/api/receipt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: finalOrder }),
        }).catch(() => {});
      } catch (_) {}
      setResult(finalOrder);
      setStatus("success");
      setFormState(createInitialFormState(nextUserRecord));
    };

    const authToken = await getCheckoutAuthToken();
    if (!authToken) {
      showSubmitError("Your login session has expired. Please sign in again to continue checkout.");
      setStatus("idle");
      return;
    }

    setStatus("processing");
    let createdOrderId = null;
    try {
      let createdOrderPayload = null;
      // Always create the server order first to get an id
      try {
        const res = await fetch("/api/orders", {
          method: "POST",
          headers: buildCheckoutRequestHeaders(authToken),
          cache: "no-store",
          body: JSON.stringify({
            deliveryAddress: order.address,
            deliveryCity: canonicalCity,
            note: order.notes,
            paymentMethod: order.paymentMethod,
            promo_code: summary.promoCode || undefined,
            items: checkoutItemsPayload,
          }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          const removedFromCart = removeOutOfStockItemsFromCart(payload);
          throw new Error(formatStockError(payload, { removedFromCart }));
        }
        createdOrderId = payload?.order?.id || null;
        createdOrderPayload = payload;
      } catch (err) {
        throw err;
      }

      if (formState.paymentMethod === "paystack") {
        if (!createdOrderId) {
          throw new Error("Unable to create order for secure payment");
        }
        if (!/^pk_(test|live)_/.test(paystackKey || "")) {
          showSubmitError("Online payments are not available: missing Paystack public key.");
          setStatus("idle");
          return;
        }
        const paystackSession = await createPaystackSession(createdOrderId, authToken);
        await launchPaystack({
          email: paystackSession.email || order.email,
          amountKobo: paystackSession.amountKobo,
          amount: createdOrderPayload?.summary?.total || summary.total,
          orderId: createdOrderId,
          reference: paystackSession.reference,
        });
        order.isOnlinePaid = true;
      } else if (formState.paymentMethod === "palmpay") {
        await launchPalmPay({
          amount: createdOrderPayload?.summary?.total || summary.total,
          orderId: createdOrderId || generateOrderId(),
        });
        order.isOnlinePaid = false;
      } else if (formState.paymentMethod === "opay") {
        await launchOpay({
          amount: createdOrderPayload?.summary?.total || summary.total,
          orderId: createdOrderId || generateOrderId(),
        });
        order.isOnlinePaid = false;
      }

      await finalize(createdOrderId, createdOrderPayload);
      setOverlayStatus("success");
      setOverlayMessage("Your order is confirmed. We are preparing it now.");
    } catch (err) {
      console.warn("Checkout error", err);
      if (createdOrderId && formState.paymentMethod !== "delivery") {
        await markOrderPaymentFailed(createdOrderId, authToken, err?.message || "Payment was not completed");
      }
      showSubmitError(err?.message || "Payment was not completed");
      setStatus("idle");
      setOverlayStatus("failure");
      setOverlayMessage(err?.message || "We could not confirm your payment. Please try again.");
    }
  };

  if (result) {
    return (
      <>
        {overlayStatus ? (
          <div className="checkout-status-overlay" role="alert" aria-live="assertive">
            <div className={`checkout-status-overlay__card checkout-status-overlay__card--${overlayStatus}`}>
              <div className="checkout-status-overlay__icon" aria-hidden="true">
                {overlayStatus === "success" ? "OK" : "X"}
              </div>
              <div className="checkout-status-overlay__body">
                <h2>{overlayStatus === "success" ? "Payment successful" : "Payment unsuccessful"}</h2>
                <p>{overlayMessage}</p>
                <button
                  type="button"
                  onClick={() => setOverlayStatus(null)}
                  className="checkout-status-overlay__close"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        ) : null}
        <CheckoutConfirmation order={result} />
      </>
    );
  }

  const getFieldErrorId = (field) => (errors[field] ? `checkout-${field}-error` : undefined);
  const cityServiceMismatch =
    Boolean(formState.city.trim()) && !findMatchingServiceZone(formState.city.trim(), deliverySettings);
  const cityErrorId = getFieldErrorId("city");
  const cityFieldHasError = Boolean(cityErrorId) || cityServiceMismatch;
  const cityDescribedBy = (() => {
    const ids = [];
    if (cityServiceMismatch) {
      ids.push("checkout-city-service-alert");
    }
    if (cityErrorId) {
      ids.push(cityErrorId);
    }
    return ids.length ? ids.join(" ") : undefined;
  })();

  return (
    <form
      ref={formRef}
      className="checkout-card"
      aria-describedby="checkout-payment-description"
      noValidate
      onSubmit={handleSubmit}
    >
      {isProcessing ? (
        <div className="checkout-alert checkout-alert--processing" role="status" aria-live="assertive">
          <span className="checkout-alert__spinner" aria-hidden="true" />
          <p>{copy.checkout.status.processingSubtitle}</p>
        </div>
      ) : null}

      <section className="checkout-section">
        <h2>{copy.checkout.deliveryDetails}</h2>
        <p className="checkout-section__hint">{sameDayNotice}</p>
        <div className="checkout-field-grid">
          <label className={errors.fullName ? "checkout-field has-error" : "checkout-field"}>
            <span>{copy.checkout.labels.fullName}</span>
            <input
              name="fullName"
              value={formState.fullName}
              onChange={handleChange}
              placeholder={copy.checkout.placeholders.fullName}
              autoComplete="name"
              pattern={NAME_PATTERN}
              title="Use letters and spaces only."
              required
              aria-invalid={Boolean(errors.fullName)}
              aria-describedby={getFieldErrorId("fullName")}
            />
            {errors.fullName ? (
              <span className="checkout-field__error" id="checkout-fullName-error">
                {errors.fullName}
              </span>
            ) : null}
          </label>
          <label className={errors.email ? "checkout-field has-error" : "checkout-field"}>
            <span>{copy.checkout.labels.email}</span>
            <input
              type="email"
              name="email"
              value={formState.email}
              onChange={handleChange}
              placeholder={copy.checkout.placeholders.email}
              autoComplete="email"
              pattern={EMAIL_PATTERN}
              title="Use letters or numbers, followed by @, ending with .com"
              required
              aria-invalid={Boolean(errors.email)}
              aria-describedby={getFieldErrorId("email")}
            />
            {errors.email ? (
              <span className="checkout-field__error" id="checkout-email-error">
                {errors.email}
              </span>
            ) : null}
          </label>
          <label className={errors.phone ? "checkout-field has-error" : "checkout-field"}>
            <span>{copy.checkout.labels.phone}</span>
            <input
              type="tel"
              name="phone"
              value={formState.phone}
              onChange={handleChange}
              placeholder={copy.checkout.placeholders.phone}
              autoComplete="tel"
              pattern={PHONE_PATTERN}
              title="Include country code and digits only, e.g. +2348120000000"
              required
              aria-invalid={Boolean(errors.phone)}
              aria-describedby={getFieldErrorId("phone")}
            />
            {errors.phone ? (
              <span className="checkout-field__error" id="checkout-phone-error">
                {errors.phone}
              </span>
            ) : null}
          </label>
        </div>
        <label className={errors.address ? "checkout-textarea has-error" : "checkout-textarea"}>
          <div className="checkout-address-row">
            <span>{copy.checkout.labels.address}</span>
            {savedAddresses.length ? (
              <div className="checkout-address-picker">
                <label className="sr-only" htmlFor="checkout-saved-address">
                  Choose a saved address
                </label>
                <select
                  id="checkout-saved-address"
                  value={selectedSavedAddressId || ""}
                  onChange={(event) => handleSelectSavedAddress(event.target.value)}
                >
                  {savedAddresses.map((addr) => (
                    <option key={addr.id} value={addr.id}>
                      {addr.label || "Saved address"} - {addr.line}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
          <textarea
            name="address"
            value={formState.address}
            onChange={handleChange}
            rows={3}
            placeholder={copy.checkout.placeholders.address}
            minLength={ADDRESS_MIN_LENGTH}
            title={`Address should be at least ${ADDRESS_MIN_LENGTH} characters.`}
            required
            aria-invalid={Boolean(errors.address)}
            aria-describedby={getFieldErrorId("address")}
          />
          {errors.address ? (
            <span className="checkout-field__error" id="checkout-address-error">
              {errors.address}
            </span>
          ) : null}
        </label>
        <div className="checkout-field-grid">
          <label className={cityFieldHasError ? "checkout-field has-error" : "checkout-field"}>
            <span>{copy.checkout.labels.city}</span>
            <select
              name="city"
              value={formState.city}
              onChange={handleChange}
              autoComplete="address-level2"
              required
              title={cityServiceMessage}
              aria-invalid={Boolean(errors.city) || cityServiceMismatch}
              aria-describedby={cityDescribedBy}
            >
              <option value="">Select your LGA</option>
              {serviceZoneOptions.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
            {cityServiceMismatch ? (
              <div
                className="checkout-field__notice checkout-field__notice--error"
                id="checkout-city-service-alert"
                role="alert"
              >
                {cityServiceMessage}
              </div>
            ) : null}
            {errors.city ? (
              <span className="checkout-field__error" id="checkout-city-error">
                {errors.city}
              </span>
            ) : null}
          </label>
          <label className="checkout-field">
            <span>{copy.checkout.labels.deliverySlot}</span>
            <select name="deliverySlot" value={formState.deliverySlot} onChange={handleChange}>
              <option value="morning">{copy.checkout.deliverySlots.morning}</option>
              <option value="afternoon">{copy.checkout.deliverySlots.afternoon}</option>
              <option value="evening">{copy.checkout.deliverySlots.evening}</option>
            </select>
          </label>
        </div>
        <label className="checkout-textarea">
          <span>{copy.checkout.labels.notes}</span>
          <textarea
            name="notes"
            value={formState.notes}
            onChange={handleChange}
            rows={3}
            placeholder={copy.checkout.placeholders.notes}
          />
        </label>
      </section>

      <section className="checkout-section">
        <h2>{copy.checkout.paymentHeading}</h2>
        <p id="checkout-payment-description" className="checkout-section__hint">
          {paymentHint}
        </p>
        <div className="checkout-payment-options">
          {enabledPaymentMethods.map((method) => (
            <label
              key={method.value}
              className={`checkout-payment-tile${
                formState.paymentMethod === method.value ? " checkout-payment-tile--active" : ""
              }`}
            >
              <input
                type="radio"
                name="paymentMethod"
                value={method.value}
                checked={formState.paymentMethod === method.value}
                onChange={handleChange}
              />
              <div>
                <span className="checkout-payment-title">{method.title}</span>
                <span className="checkout-payment-subtitle">{method.subtitle}</span>
                {Array.isArray(method.badges) && method.badges.length ? (
                  <div className="checkout-payment-badges">
                    {method.badges.map((badge, index) => {
                      const key = `${badge.label}-${index}`;
                      if (badge.type === "image" && badge.src) {
                        const imageSrc = encodeURI(badge.src);
                        return (
                          <span key={key} className="checkout-payment-badge checkout-payment-badge--image">
                            <Image
                              src={imageSrc}
                              alt={badge.label}
                              width={44}
                              height={26}
                              sizes="44px"
                              loading="lazy"
                              style={{ width: "auto", height: "24px", objectFit: "contain" }}
                            />
                          </span>
                        );
                      }
                      if (badge.icon) {
                        return (
                          <span key={key} className="checkout-payment-badge">
                            <i className={badge.icon} aria-hidden="true" />
                            <span className="sr-only">{badge.label}</span>
                          </span>
                        );
                      }
                      return (
                        <span key={key} className="checkout-payment-badge checkout-payment-badge--text">
                          {badge.label}
                        </span>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </label>
          ))}
        </div>

        {showCardFields ? (
          <div className="checkout-field-grid">
            <label className={errors.cardName ? "checkout-field has-error" : "checkout-field"}>
              <span>{copy.checkout.labels.cardName}</span>
              <input
                name="cardName"
                value={formState.cardName}
                onChange={handleChange}
                placeholder={copy.checkout.placeholders.cardName}
                autoComplete="cc-name"
                required={showCardFields}
                aria-invalid={Boolean(errors.cardName)}
                aria-describedby={getFieldErrorId("cardName")}
              />
              {errors.cardName ? (
                <span className="checkout-field__error" id="checkout-cardName-error">
                  {errors.cardName}
                </span>
              ) : null}
            </label>
            <label className={errors.cardNumber ? "checkout-field has-error" : "checkout-field"}>
              <span>{copy.checkout.labels.cardNumber}</span>
              <input
                name="cardNumber"
                value={formState.cardNumber}
                onChange={handleChange}
                inputMode="numeric"
                placeholder={copy.checkout.placeholders.cardNumber}
                autoComplete="cc-number"
                required={showCardFields}
                aria-invalid={Boolean(errors.cardNumber)}
                aria-describedby={getFieldErrorId("cardNumber")}
              />
              {errors.cardNumber ? (
                <span className="checkout-field__error" id="checkout-cardNumber-error">
                  {errors.cardNumber}
                </span>
              ) : null}
            </label>
            <label className={errors.cardExpiry ? "checkout-field has-error" : "checkout-field"}>
              <span>{copy.checkout.labels.cardExpiry}</span>
              <input
                name="cardExpiry"
                value={formState.cardExpiry}
                onChange={handleChange}
                placeholder={copy.checkout.placeholders.cardExpiry}
                autoComplete="cc-exp"
                required={showCardFields}
                aria-invalid={Boolean(errors.cardExpiry)}
                aria-describedby={getFieldErrorId("cardExpiry")}
              />
              {errors.cardExpiry ? (
                <span className="checkout-field__error" id="checkout-cardExpiry-error">
                  {errors.cardExpiry}
                </span>
              ) : null}
            </label>
            <label className={errors.cardCvc ? "checkout-field has-error" : "checkout-field"}>
              <span>{copy.checkout.labels.cardCvc}</span>
              <input
                name="cardCvc"
                value={formState.cardCvc}
                onChange={handleChange}
                inputMode="numeric"
                placeholder={copy.checkout.placeholders.cardCvc}
                autoComplete="cc-csc"
                required={showCardFields}
                aria-invalid={Boolean(errors.cardCvc)}
                aria-describedby={getFieldErrorId("cardCvc")}
              />
              {errors.cardCvc ? (
                <span className="checkout-field__error" id="checkout-cardCvc-error">
                  {errors.cardCvc}
                </span>
              ) : null}
            </label>
          </div>
        ) : null}
      </section>

      <div className="checkout-submit-wrap" ref={submitFeedbackRef}>
        <button type="submit" className="checkout-submit" disabled={isProcessing}>
          {isProcessing ? copy.checkout.status.processingTitle : copy.checkout.completeOrder}
        </button>
        {formError ? (
          <p className="checkout-submit-error" role="alert">
            {formError}
          </p>
        ) : null}
      </div>
    </form>
  );
}
