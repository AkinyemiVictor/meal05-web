"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import DeferredLocationPicker from "@/components/deferred-location-picker";

import copy from "@/data/copy";
import {
  applyStoredPromoToSummary,
  clearStoredPromo,
  clearStoredCart,
  computeCartSummary,
  dispatchCheckoutCompletedEvent,
  generateOrderId,
  persistPendingCheckoutPayment,
  persistCheckoutReceipt,
  readStoredPromo,
  readStoredCart,
  writeStoredCart,
} from "@/lib/checkout";
import { formatProductPrice } from "@/lib/catalogue";
import { AUTH_EVENT, persistStoredUser, readStoredUser } from "@/lib/auth";
import { addUserOrder } from "@/lib/orders";
import { trackPurchase } from "@/lib/analytics";
import { isCheckoutPaymentMethodEnabled } from "@/lib/payments/payment-methods";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser-client";
import {
  buildCityServiceMessage,
  findMatchingServiceZone,
  getDeliverySummaryConfig,
  normalizeServiceZoneFees,
  resolveDeliveryArea,
} from "@/lib/delivery-settings";
import { LOCATION_EVENT, readStoredLocationPreference } from "@/lib/location-preferences";
import { formatQuantity, roundQuantity, validateVariantQuantity } from "@/lib/purchase-quantities";
import { calculateOrderCapacity, formatCapacitySummary } from "@/lib/order-capacity";

const INITIAL_FORM_STATE = {
  fullName: "",
  email: "",
  phone: "",
  address: "",
  houseNumber: "",
  landmark: "",
  addressLabel: "Home",
  city: "",
  deliverySlot: "same-day-evening",
  paymentMethod: "moniepoint_transfer",
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

const DELIVERY_SLOT_LABELS = { ...copy.checkout.deliverySlots };

const CARD_FIELDS = ["cardName", "cardNumber", "cardExpiry", "cardCvc"];
const WALLET_PAYMENT_METHOD = "wallet";
const DEFAULT_GATEWAY_PAYMENT_METHOD = "moniepoint_transfer";
const TRANSFER_PAYMENT_METHODS = ["moniepoint_transfer", "opay_transfer"];

const NAME_PATTERN = "[A-Za-z ]+";
const EMAIL_PATTERN = "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}";
const PHONE_PATTERN = "\\+?[0-9]{10,15}";
const ADDRESS_MIN_LENGTH = 10;
const ADDRESS_PATTERN = "[A-Za-z0-9.,'\\-\\s]{10,}";
const NEW_ADDRESS_OPTION = "__new_address__";
const createAddressId = () => `addr_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 6)}`;
const createCheckoutIdempotencyKey = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `checkout-${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;
};

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
  return trimmed;
};

const createInitialFormState = (user) => ({
  ...INITIAL_FORM_STATE,
  fullName: user?.fullName ?? "",
  email: user?.email ?? "",
  phone: user?.phone ?? "",
  address: user?.address ?? "",
  houseNumber: user?.houseNumber ?? "",
  landmark: user?.landmark ?? "",
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
      houseNumber: String(entry.houseNumber || entry.house_number || "").trim(),
      landmark: String(entry.landmark || entry.line2 || "").trim(),
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
  if (!trimmed) return "there";
  const [first] = trimmed.split(/\s+/);
  return first || "there";
};

const getDeliverySlotLabel = (slot) => DELIVERY_SLOT_LABELS[slot] ?? slot;

const getPaymentMethodLabel = (method) => PAYMENT_METHOD_LABELS[method] ?? method;

function RequiredMark() {
  return (
    <span className="checkout-required-mark" aria-hidden="true">
      *
    </span>
  );
}

function CheckoutStatusOverlay({ status, message, onClose }) {
  if (!status) return null;
  return (
    <div className="checkout-status-overlay" role="alert" aria-live="assertive">
      <div className={`checkout-status-overlay__card checkout-status-overlay__card--${status}`}>
        <div className="checkout-status-overlay__icon" aria-hidden="true">
          {status === "success" ? "OK" : "X"}
        </div>
        <div className="checkout-status-overlay__body">
          <h2>{status === "success" ? "Payment submitted" : "Payment unsuccessful"}</h2>
          <p>{message}</p>
          <button type="button" onClick={onClose} className="checkout-status-overlay__close">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function TransferPaymentPanel({ details, status, onSubmitPayment, onBack }) {
  const payment = details?.payment || {};
  const provider = details?.provider || {};
  const amount = Number(payment.amount ?? details?.order?.summary?.total ?? 0) || 0;
  const expiresAt = payment.expires_at ? new Date(payment.expires_at) : null;
  const expiryLabel = expiresAt && Number.isFinite(expiresAt.getTime())
    ? expiresAt.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })
    : "";
  const copyText = (value) => {
    if (typeof navigator === "undefined" || !navigator.clipboard || !value) return;
    navigator.clipboard.writeText(String(value)).catch(() => {});
  };

  return (
    <section className="checkout-card checkout-transfer" aria-labelledby="checkout-transfer-heading">
      <div className="checkout-transfer__topbar">
        <button type="button" className="checkout-transfer__back" onClick={onBack}>
          <i className="fa-solid fa-arrow-left" aria-hidden="true" />
          Back
        </button>
        <span>Deposit</span>
      </div>

      <div className="checkout-transfer__hero">
        {provider.logoUrl ? (
          <Image src={provider.logoUrl} alt="" width={52} height={52} sizes="52px" />
        ) : (
          <span className="checkout-transfer__provider-mark" aria-hidden="true">
            {String(provider.displayName || "M5").slice(0, 2).toUpperCase()}
          </span>
        )}
        <p>Total to be paid</p>
        <h2 id="checkout-transfer-heading">{formatProductPrice(amount)}</h2>
        <button type="button" onClick={() => copyText(amount)} className="checkout-transfer__copy">
          Copy amount
        </button>
      </div>

      <div className="checkout-transfer__notice">
        Transfer exactly <strong>{formatProductPrice(amount)}</strong> to the account below.
      </div>

      <dl className="checkout-transfer__account">
        <div>
          <dt>Bank name</dt>
          <dd>{provider.bankName || "Bank transfer"}</dd>
        </div>
        <div>
          <dt>Account number</dt>
          <dd>
            <span>{provider.accountNumber || "Unavailable"}</span>
            {provider.accountNumber ? (
              <button type="button" onClick={() => copyText(provider.accountNumber)} aria-label="Copy account number">
                <i className="fa-regular fa-copy" aria-hidden="true" />
              </button>
            ) : null}
          </dd>
        </div>
        <div>
          <dt>Account name</dt>
          <dd>{provider.accountName || "Meal05"}</dd>
        </div>
        <div>
          <dt>Reference</dt>
          <dd>
            <span>{payment.reference || details?.order?.orderId}</span>
            {payment.reference ? (
              <button type="button" onClick={() => copyText(payment.reference)} aria-label="Copy payment reference">
                <i className="fa-regular fa-copy" aria-hidden="true" />
              </button>
            ) : null}
          </dd>
        </div>
      </dl>

      {expiryLabel ? <p className="checkout-transfer__expiry">This account expires at {expiryLabel}</p> : null}

      <button
        type="button"
        className="checkout-transfer__submit"
        onClick={onSubmitPayment}
        disabled={status === "processing"}
      >
        {status === "processing" ? "Submitting..." : "I've sent the money"}
      </button>
    </section>
  );
}

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
        {order.dispatchPartner?.name ? (
          <div>
            <dt>Dispatch partner</dt>
            <dd>{order.dispatchPartner.name}</dd>
          </div>
        ) : null}
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
                  <span>{`x${formatQuantity(quantity)}`}</span>
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

export default function CheckoutForm({
  deliverySettings,
  selectedDispatchOptionId = "",
  dispatchOptions = [],
  fulfillmentType = "delivery",
  onFulfillmentChange,
  pickupLocations = [],
  pickupLocationId = "",
  onPickupLocationChange,
  onCityChange,
  onDispatchChange,
}) {
  const router = useRouter();
  const formRef = useRef(null);
  const submitFeedbackRef = useRef(null);
  const [formState, setFormState] = useState(() =>
    createInitialFormState(typeof window !== "undefined" ? readStoredUser() : null)
  );
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [status, setStatus] = useState("idle");
  const [result, setResult] = useState(null);
  const [selectedGatewayPaymentMethod, setSelectedGatewayPaymentMethod] = useState(DEFAULT_GATEWAY_PAYMENT_METHOD);
  const [paymentStep, setPaymentStep] = useState("checkout");
  const [paymentProviderOptions, setPaymentProviderOptions] = useState([]);
  const [paymentProvidersStatus, setPaymentProvidersStatus] = useState("idle");
  const [transferDetails, setTransferDetails] = useState(null);
  const checkoutIdempotencyKeyRef = useRef(null);
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [savedDefaultAddressId, setSavedDefaultAddressId] = useState("");
  const [selectedSavedAddressId, setSelectedSavedAddressId] = useState("");
  const [addressEntryMode, setAddressEntryMode] = useState("new");
  const [overlayStatus, setOverlayStatus] = useState(null); // "success" | "failure" | null
  const [overlayMessage, setOverlayMessage] = useState("");
  const [orderSettings, setOrderSettings] = useState(null);
  const [checkoutLocation, setCheckoutLocation] = useState(() => typeof window !== "undefined" ? readStoredLocationPreference() : null);
  const deliveryArea = useMemo(
    () => resolveDeliveryArea(deliverySettings, formState.city),
    [deliverySettings, formState.city]
  );
  const deliverySummaryConfig = useMemo(
    () => {
      const config = getDeliverySummaryConfig(deliverySettings, formState.city);
      if (fulfillmentType === "pickup") return { ...config, deliveryFee: 0 };
      const dispatchOption = dispatchOptions.find(option => String(option.id) === String(selectedDispatchOptionId));
      return { ...config, deliveryFee: Number(dispatchOption?.fee || 0) };
    },
    [deliverySettings, formState.city, selectedDispatchOptionId, dispatchOptions, fulfillmentType]
  );
  const selectedDispatchOption = useMemo(
    () => dispatchOptions.find(option => String(option.id) === String(selectedDispatchOptionId)) || null,
    [dispatchOptions, selectedDispatchOptionId]
  );
  const serviceZoneOptions = useMemo(() => {
    const zones = normalizeServiceZoneFees(
      deliverySettings?.serviceZoneFees ?? deliverySettings?.serviceZones,
      deliverySettings?.deliveryFee
    );
    const names = [];
    zones.forEach((zone) => {
      if (zone?.name) names.push(zone.name);
      (Array.isArray(zone?.subzones) ? zone.subzones : []).forEach((subzone) => {
        if (subzone?.name) names.push(subzone.name);
      });
    });
    return Array.from(new Set(names.filter(Boolean)));
  }, [deliverySettings]);
  const defaultServiceCity = useMemo(
    () => serviceZoneOptions[0] || "Ibadan",
    [serviceZoneOptions]
  );
  const cityServiceMessage = useMemo(() => buildCityServiceMessage(deliverySettings), [deliverySettings]);
  const selectedSavedAddress = useMemo(
    () => savedAddresses.find((addr) => addr.id === selectedSavedAddressId) || null,
    [savedAddresses, selectedSavedAddressId]
  );
  const usingNewAddress = fulfillmentType === "delivery" && (!savedAddresses.length || addressEntryMode === "new");

  useEffect(() => {
    if (!serviceZoneOptions.length) return;
    setFormState((prev) => {
      const nextCity = resolveCitySelection(prev.city, defaultServiceCity, serviceZoneOptions, deliverySettings);
      if (nextCity === prev.city) return prev;
      return { ...prev, city: nextCity };
    });
  }, [defaultServiceCity, deliverySettings, serviceZoneOptions]);

  useEffect(() => {
    const syncLocation = (event) => setCheckoutLocation(event?.detail?.preference ?? readStoredLocationPreference());
    window.addEventListener(LOCATION_EVENT, syncLocation);
    return () => window.removeEventListener(LOCATION_EVENT, syncLocation);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/order-settings", { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((settings) => {
        if (settings) setOrderSettings(settings);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (typeof onCityChange === "function") {
      onCityChange(formState.city);
    }
  }, [formState.city, onCityChange]);

  useEffect(() => {
    if (status === "processing") return;
    checkoutIdempotencyKeyRef.current = null;
  }, [
    checkoutLocation,
    formState.address,
    formState.email,
    formState.fullName,
    formState.houseNumber,
    formState.landmark,
    formState.notes,
    formState.paymentMethod,
    formState.phone,
    fulfillmentType,
    pickupLocationId,
    selectedDispatchOptionId,
    status,
  ]);

  useEffect(() => {
    if (!dispatchOptions.some((option) => option.id === selectedDispatchOptionId)) {
      onDispatchChange?.(String((dispatchOptions.find(option => option.recommended) || dispatchOptions[0])?.id || ""));
    }
  }, [dispatchOptions, onDispatchChange, selectedDispatchOptionId]);

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
      setAddressEntryMode(normalized.length ? "saved" : "new");
      if (defaultId) {
        const match = normalized.find((addr) => addr.id === defaultId);
        if (match) {
          setFormState((prev) => {
            return {
              ...prev,
              address: match.line,
              houseNumber: match.houseNumber || "",
              landmark: match.landmark || "",
              addressLabel: match.label || "Home",
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

  // Gateway options stay visible but disabled until server-side provider settings activate them.
  const paystackKey = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || "";
  const showCardFields = false;
  const isProcessing = status === "processing";
  const paymentMethods = useMemo(() => copy.checkout.paymentMethods, []);
  const paymentGroups = useMemo(() => copy.checkout.paymentGroups || [], []);
  const gatewayPaymentMethods = useMemo(
    () => paymentMethods.filter((method) => method.value !== WALLET_PAYMENT_METHOD),
    [paymentMethods]
  );
  const selectedPaymentGroup = formState.paymentMethod === WALLET_PAYMENT_METHOD ? WALLET_PAYMENT_METHOD : "gateway";
  const enabledPaymentMethods = useMemo(
    () => paymentMethods.filter((method) => isCheckoutPaymentMethodEnabled(method.value)),
    [paymentMethods]
  );
  const enabledGatewayPaymentMethods = useMemo(
    () => gatewayPaymentMethods.filter((method) => isCheckoutPaymentMethodEnabled(method.value)),
    [gatewayPaymentMethods]
  );
  const transferPaymentMethods = useMemo(() => {
    return TRANSFER_PAYMENT_METHODS.map((code) => {
      const method = paymentMethods.find((entry) => entry.value === code) || {
        value: code,
        title: code,
        subtitle: "Bank Transfer.",
        badges: [],
      };
      const provider = paymentProviderOptions.find((entry) => entry.code === code);
      const hasProvider = Boolean(provider);
      const available = hasProvider
        ? Boolean(provider.available)
        : paymentProvidersStatus === "idle" && paymentStep !== "provider"
          ? isCheckoutPaymentMethodEnabled(code)
          : false;
      return {
        ...method,
        title: provider?.displayName || method.title,
        subtitle: provider?.customerNotice || method.subtitle,
        provider,
        available,
        badge: provider?.badge || (method.badges?.[0]?.label ?? ""),
      };
    });
  }, [paymentMethods, paymentProviderOptions, paymentProvidersStatus, paymentStep]);

  useEffect(() => {
    if (paymentStep !== "provider" && selectedPaymentGroup !== "gateway") return;
    const controller = new AbortController();
    setPaymentProvidersStatus("loading");
    fetch("/api/payment-methods", { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Unable to load payment methods."))))
      .then((payload) => {
        const methods = Array.isArray(payload?.methods) ? payload.methods : [];
        setPaymentProviderOptions(
          methods
            .filter((method) => TRANSFER_PAYMENT_METHODS.includes(method?.code))
            .sort((a, b) => Number(a.displayOrder || 100) - Number(b.displayOrder || 100))
        );
        setPaymentProvidersStatus("ready");
      })
      .catch((error) => {
        if (error?.name === "AbortError") return;
        setPaymentProvidersStatus("error");
      });
    return () => controller.abort();
  }, [paymentStep, selectedPaymentGroup]);

  useEffect(() => {
    if (!enabledPaymentMethods.length) return;
    if (enabledPaymentMethods.some((method) => method.value === formState.paymentMethod)) return;
    const fallback = enabledGatewayPaymentMethods[0] || enabledPaymentMethods[0];
    setFormState((prev) => ({ ...prev, paymentMethod: fallback.value }));
  }, [enabledGatewayPaymentMethods, enabledPaymentMethods, formState.paymentMethod]);

  useEffect(() => {
    if (formState.paymentMethod === WALLET_PAYMENT_METHOD) return;
    setSelectedGatewayPaymentMethod(formState.paymentMethod || DEFAULT_GATEWAY_PAYMENT_METHOD);
  }, [formState.paymentMethod]);

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
    if (lower.includes("insufficient") && (lower.includes("wallet") || lower.includes("balance"))) {
      return "Insufficient wallet funds. Please fund your wallet or choose another payment method.";
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

    if (["address", "houseNumber"].includes(name) && addressEntryMode !== "new") {
      setAddressEntryMode("new");
      setSelectedSavedAddressId("");
    }
  };

  const handlePaymentGroupChange = (group) => {
    setPaymentStep("checkout");
    setTransferDetails(null);
    setFormError(null);
    if (group === WALLET_PAYMENT_METHOD) {
      setFormState((prev) => ({ ...prev, paymentMethod: WALLET_PAYMENT_METHOD }));
      return;
    }
    const fallbackGateway = enabledGatewayPaymentMethods[0]?.value || DEFAULT_GATEWAY_PAYMENT_METHOD;
    setFormState((prev) => ({ ...prev, paymentMethod: selectedGatewayPaymentMethod || fallbackGateway }));
  };

  const handleGatewayPaymentMethodChange = (event) => {
    const { value } = event.target;
    setSelectedGatewayPaymentMethod(value);
    setFormError(null);
    handleChange(event);
  };

  const handleSelectSavedAddress = (id) => {
    if (id === NEW_ADDRESS_OPTION) {
      setAddressEntryMode("new");
      setSelectedSavedAddressId("");
      setFormState((prev) => ({
        ...prev,
        address: "",
        houseNumber: "",
        landmark: "",
        addressLabel: "Home",
      }));
      setErrors((prev) => {
        if (!prev.address && !prev.houseNumber) return prev;
        const next = { ...prev };
        delete next.address;
        delete next.houseNumber;
        return next;
      });
      return;
    }

    setAddressEntryMode("saved");
    setSelectedSavedAddressId(id);
    const match = savedAddresses.find((addr) => addr.id === id);
    if (!match) return;
    setFormState((prev) => ({
      ...prev,
      address: match.line,
      houseNumber: match.houseNumber || prev.houseNumber,
      landmark: match.landmark || prev.landmark,
      addressLabel: match.label || prev.addressLabel,
      city: resolveCitySelection(match.city || defaultServiceCity, defaultServiceCity, serviceZoneOptions, deliverySettings),
    }));
    setErrors((prev) => {
      if (!prev.address && !prev.houseNumber && !prev.city) return prev;
      const next = { ...prev };
      delete next.address;
      delete next.houseNumber;
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
    if (fulfillmentType === "delivery") {
      if (!normalizedEmail) {
        nextErrors.email = validation.required;
      } else if (!EMAIL_REGEX.test(normalizedEmail)) {
        nextErrors.email = validation.email;
      }
    }

    const normalizedPhone = state.phone.trim();
    const phoneDigits = normalizedPhone.replace(/\s+/g, "");
    if (!phoneDigits) {
      nextErrors.phone = validation.required;
    } else if (!PHONE_REGEX.test(phoneDigits)) {
      nextErrors.phone = validation.phone;
    }
    if (fulfillmentType === "delivery") {
      const usingSavedAddress = savedAddresses.length > 0 && addressEntryMode !== "new";
      if (usingSavedAddress) {
        const selectedAddress = savedAddresses.find((addr) => addr.id === selectedSavedAddressId);
        if (!selectedAddress?.line?.trim()) {
          nextErrors.address = "Select a delivery address.";
        }
        if (!selectedAddress?.houseNumber?.trim()) {
          nextErrors.houseNumber = "Add a house, flat, shop or gate number to this address.";
        }
        if (!selectedAddress?.landmark?.trim()) {
          nextErrors.landmark = "Add a landmark or delivery direction to this address.";
        }
      } else {
        if (!state.houseNumber.trim()) nextErrors.houseNumber = "Enter the house, flat, shop or gate number.";
        const addressTrimmed = state.address.trim();
        if (!addressTrimmed) nextErrors.address = validation.required;
        else if (addressTrimmed.length < ADDRESS_MIN_LENGTH) nextErrors.address = validation.addressLength ?? validation.required;
        if (!state.landmark.trim()) nextErrors.landmark = "Enter a landmark or delivery direction.";
      }
      const cityTrimmed = state.city.trim();
      const resolvedArea = resolveDeliveryArea(deliverySettings, cityTrimmed);
      if (!cityTrimmed) nextErrors.city = validation.required;
      else if (!resolvedArea.available) nextErrors.city = cityServiceMessage || validation.required;
      if (!selectedDispatchOption) nextErrors.dispatchPartner = "Select an available delivery partner.";
    } else if (!pickupLocationId) {
      nextErrors.pickupLocation = "Select a pickup location.";
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

  const buildCheckoutRequestHeaders = (token, idempotencyKey = null) => {
    const headers = { "Content-Type": "application/json" };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    if (idempotencyKey) {
      headers["Idempotency-Key"] = idempotencyKey;
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

  const handleDispatchChange = (event) => {
    onDispatchChange?.(event.target.value);
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
        const order = ["fullName", ...(fulfillmentType === "delivery" ? ["email"] : []), "phone", "pickupLocation", "houseNumber", "address", "landmark", "city", ...CARD_FIELDS];
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
    const paymentMethodForOrder =
      selectedPaymentGroup === WALLET_PAYMENT_METHOD
        ? WALLET_PAYMENT_METHOD
        : selectedGatewayPaymentMethod || DEFAULT_GATEWAY_PAYMENT_METHOD;
    if (!isCheckoutPaymentMethodEnabled(paymentMethodForOrder)) {
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
          quantity: Number.isFinite(quantity) && quantity > 0 ? roundQuantity(quantity) : 1,
          unit_price_at_add: Number.isFinite(Number(item?.price)) ? Number(item.price) : undefined,
          variant_name: item?.variantName || undefined,
          product_name: item?.name || undefined,
        };
      })
      .filter((item) => item.product_id || item.variant_id);

    const quantityIssue = cartItems
      .map((item) => ({ item, validation: validateVariantQuantity(item, Number(item?.quantity) || Number(item?.orderCount) || 1) }))
      .find((entry) => !entry.validation.ok);
    if (quantityIssue) {
      showSubmitError(`${quantityIssue.item?.name || "An item"}: ${quantityIssue.validation.error}`);
      return;
    }

    const capacity = calculateOrderCapacity(cartItems, orderSettings?.standardCheckout);
    if (orderSettings?.bulkOrder?.enabled !== false && capacity.requiresBulk) {
      showSubmitError(
        `${orderSettings?.bulkOrder?.heading || "Planning a larger order?"} ${orderSettings?.bulkOrder?.message || ""} Estimated capacity: ${formatCapacitySummary(capacity)}.`
      );
      return;
    }

    setErrors({});
    setFormError(null);

    const deliveryLocation = readStoredLocationPreference();
    const deliveryLatitude = Number(deliveryLocation?.coords?.latitude);
    const deliveryLongitude = Number(deliveryLocation?.coords?.longitude);
    if (fulfillmentType === "delivery" && (!deliveryLocation?.serviceable || !Number.isFinite(deliveryLatitude) || !Number.isFinite(deliveryLongitude))) {
      showSubmitError("Select and confirm a supported delivery location before placing your order.");
      return;
    }

    const baseSummary = computeCartSummary(cartItems, {
      freeDeliveryThreshold: deliverySummaryConfig.freeDeliveryThreshold,
      deliveryFee: deliverySummaryConfig.deliveryFee,
    });
    const summary = applyStoredPromoToSummary(baseSummary, readStoredPromo());

    if (selectedPaymentGroup === "gateway" && paymentStep === "checkout") {
      const pendingCity = formState.city.trim();
      const pendingArea = resolveDeliveryArea(deliverySettings, pendingCity);
      const pendingCanonicalCity = pendingArea.available
        ? pendingArea.matchedName || pendingArea.zone
        : pendingCity;
      const pendingForm = {
        ...formState,
        fullName: formState.fullName.trim(),
        email: formState.email.trim().toLowerCase(),
        phone: formState.phone.trim().replace(/\s+/g, ""),
        address: formState.address.trim(),
        houseNumber: formState.houseNumber.trim(),
        landmark: formState.landmark.trim(),
        addressLabel: formState.addressLabel.trim() || "Home",
        city: pendingCanonicalCity,
        paymentMethod: DEFAULT_GATEWAY_PAYMENT_METHOD,
        notes: fulfillmentType === "delivery" ? formState.notes.trim() : "",
        deliverySlot: "same-day-evening",
      };
      persistPendingCheckoutPayment({
        createdAt: new Date().toISOString(),
        form: pendingForm,
        fulfillmentType,
        pickupLocationId,
        selectedDispatchOptionId,
        selectedDispatchOption,
        deliveryLocation: {
          serviceable: Boolean(deliveryLocation?.serviceable),
          latitude: deliveryLatitude,
          longitude: deliveryLongitude,
          label: deliveryLocation?.line || deliveryLocation?.zone?.name || "",
        },
        summary,
        promoCode: summary.promoCode || "",
        items: checkoutItemsPayload,
        cartItems,
      });
      setFormState((prev) => ({ ...prev, paymentMethod: DEFAULT_GATEWAY_PAYMENT_METHOD }));
      setStatus("idle");
      router.push("/checkout/payment");
      return;
    }

    if (selectedPaymentGroup === "gateway" && !TRANSFER_PAYMENT_METHODS.includes(paymentMethodForOrder)) {
      showSubmitError("Choose Moniepoint or OPay transfer to continue.");
      return;
    }

    const selectedTransferMethod = transferPaymentMethods.find((method) => method.value === paymentMethodForOrder);
    if (selectedPaymentGroup === "gateway" && selectedTransferMethod && !selectedTransferMethod.available) {
      showSubmitError(`${selectedTransferMethod.title} is not available right now. Please choose another transfer option.`);
      return;
    }

    const orderStatus = selectedPaymentGroup === "gateway" ? "awaiting payment" : "processing";
    const storedUser = readStoredUser();

    const cityTrimmed = formState.city.trim();
    const resolvedDeliveryArea = resolveDeliveryArea(deliverySettings, cityTrimmed);
    const canonicalCity = resolvedDeliveryArea.available
      ? resolvedDeliveryArea.matchedName || resolvedDeliveryArea.zone
      : "";

    const normalizedForm = {
      ...formState,
      fullName: formState.fullName.trim(),
      email: formState.email.trim().toLowerCase(),
      phone: formState.phone.trim().replace(/\s+/g, ""),
      address: formState.address.trim(),
      houseNumber: formState.houseNumber.trim(),
      landmark: formState.landmark.trim(),
      addressLabel: formState.addressLabel.trim() || "Home",
      city: canonicalCity,
      paymentMethod: paymentMethodForOrder,
      notes: fulfillmentType === "delivery" ? formState.notes.trim() : "",
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
              ? { ...existing, line: normalizedForm.address, houseNumber: normalizedForm.houseNumber, landmark: normalizedForm.landmark, label: normalizedForm.addressLabel, city: canonicalCity || existing.city || defaultServiceCity }
              : addr
          );
          defaultAddressId = existing.id;
        } else {
          const entry = {
            id: createAddressId(),
            label: normalizedForm.addressLabel || "Home",
            line: normalizedForm.address,
            houseNumber: normalizedForm.houseNumber,
            landmark: normalizedForm.landmark,
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
        houseNumber: normalizedForm.houseNumber || base.houseNumber || "",
        landmark: normalizedForm.landmark || base.landmark || "",
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
      dispatchPartner: selectedDispatchOption,
      createdAt: new Date().toISOString(),
      status: orderStatus,
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
          headers: buildCheckoutRequestHeaders(authToken, orderIdempotencyKey),
          cache: "no-store",
          body: JSON.stringify({
            deliveryAddress: order.address,
            deliveryHouseNumber: order.houseNumber,
            deliveryStreet: order.address,
            deliveryLandmark: order.landmark,
            deliveryAddressLabel: order.addressLabel,
            deliveryContactName: order.fullName,
            deliveryContactPhone: order.phone,
            deliveryCity: canonicalCity,
            deliveryLatitude: fulfillmentType === "delivery" ? deliveryLatitude : undefined,
            deliveryLongitude: fulfillmentType === "delivery" ? deliveryLongitude : undefined,
            fulfillmentType,
            pickupLocationId: fulfillmentType === "pickup" ? pickupLocationId : undefined,
            deliveryPartnerId: fulfillmentType === "delivery" ? selectedDispatchOption?.id : undefined,
            note: order.notes,
            paymentMethod: order.paymentMethod,
            promo_code: summary.promoCode || undefined,
            items: checkoutItemsPayload,
          }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (payload?.bulkOrderRequired || payload?.error === "BULK_ORDER_REQUIRED") {
            const capacityText = [
              Number(payload?.capacity?.weightKg) > Number(payload?.capacity?.maxWeightKg)
                ? `approximately ${formatQuantity(payload.capacity.weightKg, "kg")}`
                : "",
              Number(payload?.capacity?.liquidLiters) > Number(payload?.capacity?.maxLiquidLiters)
                ? `approximately ${formatQuantity(payload.capacity.liquidLiters, "L")}`
                : "",
            ]
              .filter(Boolean)
              .join(" + ");
            throw new Error(
              `${payload?.heading || "Planning a larger order?"} ${payload?.message || "Meal05 handles larger orders too."}${
                capacityText ? ` Estimated basket capacity: ${capacityText}.` : ""
              }`
            );
          }
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
        payment: serverPayload?.payment || null,
        paymentProvider: serverPayload?.paymentProvider || null,
      };

      persistCheckoutReceipt(finalOrder);
      clearStoredCart();
      clearStoredPromo();
      addUserOrder(finalOrder, finalOrder.status, nextUserRecord);
      dispatchCheckoutCompletedEvent({ items: cartItems, summary: serverSummary, order: finalOrder });
      checkoutIdempotencyKeyRef.current = null;
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

    const orderIdempotencyKey = checkoutIdempotencyKeyRef.current || createCheckoutIdempotencyKey();
    checkoutIdempotencyKeyRef.current = orderIdempotencyKey;
    setStatus("processing");
    let createdOrderId = null;
    try {
      let createdOrderPayload = null;
      // Always create the server order first to get an id
      try {
        const res = await fetch("/api/orders", {
          method: "POST",
          headers: buildCheckoutRequestHeaders(authToken, orderIdempotencyKey),
          cache: "no-store",
          body: JSON.stringify({
            deliveryAddress: order.address,
            deliveryHouseNumber: order.houseNumber,
            deliveryStreet: order.address,
            deliveryLandmark: order.landmark,
            deliveryAddressLabel: order.addressLabel,
            deliveryContactName: order.fullName,
            deliveryContactPhone: order.phone,
            deliveryCity: canonicalCity,
            deliveryLatitude: fulfillmentType === "delivery" ? deliveryLatitude : undefined,
            deliveryLongitude: fulfillmentType === "delivery" ? deliveryLongitude : undefined,
            fulfillmentType,
            pickupLocationId: fulfillmentType === "pickup" ? pickupLocationId : undefined,
            deliveryPartnerId: fulfillmentType === "delivery" ? selectedDispatchOption?.id : undefined,
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

      if (TRANSFER_PAYMENT_METHODS.includes(paymentMethodForOrder)) {
        if (!createdOrderId) {
          throw new Error("Unable to create order for bank transfer");
        }
        const transferResponse = await fetch("/api/payments/bank-transfer/initialize", {
          method: "POST",
          headers: buildCheckoutRequestHeaders(authToken, `${orderIdempotencyKey}:payment`),
          cache: "no-store",
          body: JSON.stringify({ orderId: createdOrderId, providerCode: paymentMethodForOrder }),
        });
        const transferPayload = await transferResponse.json().catch(() => ({}));
        if (!transferResponse.ok) {
          throw new Error(transferPayload?.error || "Unable to prepare bank transfer details.");
        }
        setTransferDetails({
          order: {
            ...order,
            orderId: String(createdOrderId),
            summary: createdOrderPayload?.summary || summary,
          },
          payment: transferPayload.payment,
          provider: transferPayload.provider,
        });
        setPaymentStep("transfer");
        setStatus("idle");
        checkoutIdempotencyKeyRef.current = null;
        return;
      } else if (paymentMethodForOrder === "paystack") {
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
      } else if (paymentMethodForOrder === "palmpay") {
        await launchPalmPay({
          amount: createdOrderPayload?.summary?.total || summary.total,
          orderId: createdOrderId || generateOrderId(),
        });
        order.isOnlinePaid = false;
      } else if (paymentMethodForOrder === "opay") {
        await launchOpay({
          amount: createdOrderPayload?.summary?.total || summary.total,
          orderId: createdOrderId || generateOrderId(),
        });
        order.isOnlinePaid = false;
      }

      await finalize(createdOrderId, createdOrderPayload);
      setOverlayStatus("success");
      setOverlayMessage(
        "Your order is confirmed. We are preparing it now."
      );
    } catch (err) {
      console.warn("Checkout error", err);
      if (createdOrderId && !["delivery", "wallet", ...TRANSFER_PAYMENT_METHODS].includes(paymentMethodForOrder)) {
        await markOrderPaymentFailed(createdOrderId, authToken, err?.message || "Payment was not completed");
      }
      showSubmitError(err?.message || "Payment was not completed");
      setStatus("idle");
      setOverlayStatus("failure");
      setOverlayMessage(err?.message || "We could not confirm your payment. Please try again.");
    }
  };

  const handleTransferSubmitted = async () => {
    if (!transferDetails?.payment?.id || status === "processing") return;
    const authToken = await getCheckoutAuthToken();
    if (!authToken) {
      showSubmitError("Your login session has expired. Please sign in again to continue checkout.");
      return;
    }
    setStatus("processing");
    setFormError(null);
    try {
      const response = await fetch("/api/payments/bank-transfer/submit", {
        method: "POST",
        headers: buildCheckoutRequestHeaders(authToken, `${transferDetails.payment.id}:submit`),
        cache: "no-store",
        body: JSON.stringify({
          paymentId: transferDetails.payment.id,
          payerAccountName: transferDetails.order?.fullName || "Meal05 customer",
          payerBankName: "Customer bank",
          customerTransactionReference: "",
          exactAmountConfirmed: true,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to submit payment.");
      }
      setStatus("idle");
      setOverlayStatus("success");
      setOverlayMessage(payload?.message || "Payment submitted. Meal05 will confirm it before the order appears in your active orders.");
    } catch (error) {
      setStatus("idle");
      setOverlayStatus("failure");
      setOverlayMessage(error?.message || "Unable to submit payment.");
    }
  };

  if (result) {
    return (
      <>
        <CheckoutStatusOverlay status={overlayStatus} message={overlayMessage} onClose={() => setOverlayStatus(null)} />
        <CheckoutConfirmation order={result} />
      </>
    );
  }

  if (paymentStep === "transfer" && transferDetails) {
    return (
      <>
        <CheckoutStatusOverlay status={overlayStatus} message={overlayMessage} onClose={() => setOverlayStatus(null)} />
        <TransferPaymentPanel
          details={transferDetails}
          status={status}
          onSubmitPayment={handleTransferSubmitted}
          onBack={() => {
            setPaymentStep("provider");
            setTransferDetails(null);
            setOverlayStatus(null);
            setFormError(null);
          }}
        />
      </>
    );
  }

  const getFieldErrorId = (field) => (errors[field] ? `checkout-${field}-error` : undefined);
  const cityServiceMismatch =
    Boolean(formState.city.trim()) && !deliveryArea.available;
  const cityErrorId = getFieldErrorId("city");
  const cityFieldHasError = Boolean(cityErrorId) || cityServiceMismatch;
  const cityDescribedBy = (() => {
    const ids = [];
    if (cityServiceMismatch) {
      ids.push("checkout-city-service-alert");
    }
    if (!cityServiceMismatch && deliveryArea.available) {
      ids.push("checkout-city-fee-note");
    }
    if (cityErrorId) {
      ids.push(cityErrorId);
    }
    return ids.length ? ids.join(" ") : undefined;
  })();

  return (
    <>
    <CheckoutStatusOverlay status={overlayStatus} message={overlayMessage} onClose={() => setOverlayStatus(null)} />
    <form
      id="checkout-order-form"
      ref={formRef}
      className="checkout-card"
      aria-describedby={paymentHint ? "checkout-payment-description" : undefined}
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
        <div className="checkout-section__heading"><span className="checkout-section__icon"><i className="fa-solid fa-box" /></span><h2>Receive order</h2></div>
        <div className="checkout-payment-options">
          {[{ value: "pickup", title: "Pickup" }, { value: "delivery", title: "Delivery" }].map(option => <label key={option.value} className={`checkout-payment-tile${fulfillmentType === option.value ? " checkout-payment-tile--active" : ""}`}><input type="radio" name="fulfillmentType" value={option.value} checked={fulfillmentType === option.value} onChange={event => onFulfillmentChange?.(event.target.value)} /><span className="checkout-payment-icon"><i className={option.value === "pickup" ? "fa-solid fa-store" : "fa-solid fa-truck"} /></span><div><span className="checkout-payment-title">{option.title}</span></div></label>)}
        </div>
      </section>

      <section className="checkout-section">
        <div className="checkout-section__heading">
          <span className="checkout-section__icon" aria-hidden="true">
            <i className="fa-solid fa-location-dot" />
          </span>
          <h2>{fulfillmentType === "pickup" ? "Pickup details" : copy.checkout.deliveryDetails}</h2>
        </div>
        <div className="checkout-field-grid">
          <label className={errors.fullName ? "checkout-field has-error" : "checkout-field"}>
            <span>{copy.checkout.labels.fullName} <RequiredMark /></span>
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
          {fulfillmentType === "delivery" ? (
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
          ) : null}
          <label className={errors.phone ? "checkout-field has-error" : "checkout-field"}>
            <span>{copy.checkout.labels.phone} <RequiredMark /></span>
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
        {fulfillmentType === "pickup" ? <label className={errors.pickupLocation ? "checkout-field has-error" : "checkout-field"}><span>Pickup location</span><select name="pickupLocation" value={pickupLocationId} onChange={event => onPickupLocationChange?.(event.target.value)} required aria-invalid={Boolean(errors.pickupLocation)}><option value="">Select a pickup point</option>{pickupLocations.map(location => <option key={location.id} value={location.id}>{location.name} - {location.address}</option>)}</select>{errors.pickupLocation ? <span className="checkout-field__error" id="checkout-pickupLocation-error">{errors.pickupLocation}</span> : null}</label> : <>
        {savedAddresses.length ? (
          <label className={(errors.address || errors.houseNumber || errors.landmark) && !usingNewAddress ? "checkout-field has-error" : "checkout-field"}>
            <span>Delivery address <RequiredMark /></span>
            <select
              id="checkout-saved-address"
              name="savedAddressId"
              value={addressEntryMode === "new" ? NEW_ADDRESS_OPTION : selectedSavedAddressId || ""}
              onChange={(event) => handleSelectSavedAddress(event.target.value)}
              required
              aria-invalid={Boolean((errors.address || errors.houseNumber || errors.landmark) && !usingNewAddress)}
              aria-describedby={(errors.address || errors.houseNumber || errors.landmark) && !usingNewAddress ? "checkout-address-error" : undefined}
            >
              <option value="">Select saved address</option>
              {savedAddresses.map((addr) => (
                <option key={addr.id} value={addr.id}>
                  {addr.label || "Saved address"} - {addr.line}
                </option>
              ))}
              <option value={NEW_ADDRESS_OPTION}>Use a new address</option>
            </select>
            {(errors.address || errors.houseNumber || errors.landmark) && !usingNewAddress ? (
              <span className="checkout-field__error" id="checkout-address-error">
                {errors.address || errors.houseNumber || errors.landmark}
              </span>
            ) : null}
          </label>
        ) : null}
        {!usingNewAddress && selectedSavedAddress ? (
          <div className="checkout-address-summary">
            <strong>{selectedSavedAddress.label || "Saved address"}</strong>
            <span>{selectedSavedAddress.line}</span>
            {selectedSavedAddress.landmark ? <small>{selectedSavedAddress.landmark}</small> : null}
          </div>
        ) : null}
        {usingNewAddress ? (
          <>
            <div className="checkout-field-grid checkout-field-grid--address-meta">
              <label className={errors.houseNumber ? "checkout-field has-error" : "checkout-field"}><span>House / flat / shop number <RequiredMark /></span><input name="houseNumber" value={formState.houseNumber} onChange={handleChange} placeholder="e.g. No. 8 or Flat 2B" autoComplete="address-line1" required aria-invalid={Boolean(errors.houseNumber)}/>{errors.houseNumber ? <span className="checkout-field__error">{errors.houseNumber}</span> : null}</label>
            </div>
            <label className={errors.address ? "checkout-textarea has-error" : "checkout-textarea"}>
              <span>Street, estate and area <RequiredMark /></span>
              <textarea
                name="address"
                value={formState.address}
                onChange={handleChange}
                rows={3}
                placeholder="Street name, estate, area and closest junction"
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
            <label className={errors.landmark ? "checkout-textarea has-error" : "checkout-textarea"}><span>Landmark / directions <RequiredMark /></span><textarea name="landmark" value={formState.landmark} onChange={handleChange} rows={2} placeholder="e.g. White gate opposite Peace Model School" maxLength={300} required aria-invalid={Boolean(errors.landmark)} aria-describedby={getFieldErrorId("landmark")}/>{errors.landmark ? <span className="checkout-field__error" id="checkout-landmark-error">{errors.landmark}</span> : null}</label>
          </>
        ) : null}
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
            {!cityServiceMismatch && deliveryArea.available ? (
              <div className="checkout-field__notice" id="checkout-city-fee-note">
                Delivery to {deliveryArea.matchedName || deliveryArea.zone} is {formatProductPrice(deliveryArea.fee)} before any free-delivery offer.
              </div>
            ) : null}
            {errors.city ? (
              <span className="checkout-field__error" id="checkout-city-error">
                {errors.city}
              </span>
            ) : null}
          </label>
          {usingNewAddress ? (
            <label className="checkout-field"><span>Save address as</span><select name="addressLabel" value={formState.addressLabel} onChange={handleChange}><option>Home</option><option>Office</option><option>Shop</option><option>Other</option></select></label>
          ) : null}
        </div>
        <div className="checkout-field-grid">
          <label className="checkout-field">
            <span>Delivery window</span>
            <select name="deliverySlot" value={formState.deliverySlot} onChange={handleChange}>
              <option value="same-day-evening">{copy.checkout.deliverySlots["same-day-evening"]}</option>
            </select>
          </label>
        </div>
        <div className="checkout-dispatch" aria-labelledby="checkout-dispatch-heading">
          <div className="checkout-dispatch__header">
            <div>
              <h3 id="checkout-dispatch-heading">Choose dispatch company</h3>
            </div>
            {selectedDispatchOption?.name ? (
              <span className="checkout-dispatch__current">
                {selectedDispatchOption.name}
              </span>
            ) : null}
          </div>
          <div className="checkout-dispatch__list">
            {!dispatchOptions.length ? <div className="checkout-field__notice checkout-field__notice--error">No delivery company is currently active for this location. Choose pickup or check again later.</div> : null}
            {dispatchOptions.map((option) => (
              <label
                key={option.id}
                className={`checkout-dispatch-card${
                  selectedDispatchOptionId === option.id ? " checkout-dispatch-card--active" : ""
                }`}
              >
                <input
                  type="radio"
                  name="dispatchOption"
                  value={option.id}
                  checked={selectedDispatchOptionId === option.id}
                  onChange={handleDispatchChange}
                  disabled={!deliveryArea.available}
                />
                <span className="checkout-dispatch-card__body">
                  <span className="checkout-dispatch-card__topline">
                    <span className="checkout-dispatch-card__name">{option.logoUrl ? <Image src={option.logoUrl} alt="" width={32} height={32} style={{ objectFit: "contain", marginRight: 8, verticalAlign: "middle" }} /> : null}{option.name}</span>
                    {option.recommended ? (
                      <span className="checkout-dispatch-card__badge">Recommended</span>
                    ) : (
                      <span className="checkout-dispatch-card__badge checkout-dispatch-card__badge--muted">
                        {option.reason}
                      </span>
                    )}
                  </span>
                  <span className="checkout-dispatch-card__summary">{option.summary}</span>
                  <span className="checkout-dispatch-card__meta">
                    <span>{option.eta}</span>
                    <strong>{deliveryArea.available ? formatProductPrice(option.fee) : "Select delivery area"}</strong>
                  </span>
                </span>
              </label>
            ))}
          </div>
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
            <div className="checkout-pin-confirmation">
              <span className="checkout-pin-confirmation__icon"><i className="fa-solid fa-location-dot" /></span>
              <div><small>Delivery pin</small><strong>{checkoutLocation?.serviceable ? (checkoutLocation.line || checkoutLocation.zone?.name || "Location confirmed") : "Confirm location"}</strong></div>
              <DeferredLocationPicker />
            </div>
          </>}
        {fulfillmentType === "pickup" ? (
          <div className="checkout-field-grid">
            <label className="checkout-field">
              <span>Pickup window</span>
              <select name="deliverySlot" value={formState.deliverySlot} onChange={handleChange}>
                <option value="same-day-evening">{copy.checkout.deliverySlots["same-day-evening"]}</option>
              </select>
            </label>
          </div>
        ) : null}
      </section>

      <section className="checkout-section">
        <div className="checkout-section__heading">
          <span className="checkout-section__icon" aria-hidden="true">
            <i className="fa-regular fa-credit-card" />
          </span>
          <h2>{copy.checkout.paymentHeading}</h2>
        </div>
        {paymentHint ? (
          <p id="checkout-payment-description" className="checkout-section__hint">
            {paymentHint}
          </p>
        ) : null}
        <div className="checkout-payment-options checkout-payment-options--groups">
          {paymentGroups.map((group) => {
            const active = selectedPaymentGroup === group.value;
            return (
              <label
                key={group.value}
                className={`checkout-payment-tile checkout-payment-tile--group${active ? " checkout-payment-tile--active" : ""}`}
              >
                <input
                  type="radio"
                  name="paymentGroup"
                  value={group.value}
                  checked={active}
                  onChange={() => handlePaymentGroupChange(group.value)}
                />
                <span className="checkout-payment-icon" aria-hidden="true">
                  <i className={group.icon} />
                </span>
                <div>
                  <span className="checkout-payment-title">{group.title}</span>
                </div>
              </label>
            );
          })}
        </div>

        {selectedPaymentGroup === "gateway" && paymentStep === "provider" ? (
          <div className="checkout-payment-provider-panel">
            <div className="checkout-payment-provider-panel__header">
              <strong>Choose transfer provider</strong>
              {paymentProvidersStatus === "loading" ? <span>Loading...</span> : null}
            </div>
            <div className="checkout-payment-options checkout-payment-options--providers">
              {transferPaymentMethods.map((method) => {
                const enabled = method.available;
                return (
                  <label
                    key={method.value}
                    className={`checkout-payment-tile checkout-payment-tile--provider${
                      selectedGatewayPaymentMethod === method.value ? " checkout-payment-tile--active" : ""
                    }${enabled ? "" : " checkout-payment-tile--disabled"}`}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value={method.value}
                      checked={selectedGatewayPaymentMethod === method.value}
                      disabled={!enabled}
                      onChange={handleGatewayPaymentMethodChange}
                    />
                    <span className="checkout-payment-icon" aria-hidden="true">
                      <i
                        className={
                          method.value === "opay_transfer"
                            ? "fa-solid fa-qrcode"
                            : method.value === "moniepoint_transfer"
                              ? "fa-solid fa-building-columns"
                              : "fa-regular fa-credit-card"
                        }
                      />
                    </span>
                    <div>
                      <span className="checkout-payment-title">{method.title}</span>
                      {method.badge || (Array.isArray(method.badges) && method.badges.length) ? (
                        <div className="checkout-payment-badges">
                          {(method.badge ? [{ type: "text", label: method.badge }] : method.badges).map((badge, index) => {
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
                );
              })}
            </div>
          </div>
        ) : null}

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

      <div className="checkout-submit-wrap" ref={submitFeedbackRef} data-processing={isProcessing ? "true" : "false"}>
        {formError ? (
          <p className="checkout-submit-error" role="alert">
            {formError}
          </p>
        ) : null}
      </div>
    </form>
    </>
  );
}
