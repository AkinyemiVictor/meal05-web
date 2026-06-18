"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import styles from "./account.module.css";
import { AUTH_EVENT, clearStoredUser, persistStoredUser, readStoredUser } from "@/lib/auth";
import { buildSignInHref } from "@/lib/auth-redirect";
import { ORDERS_EVENT, readUserOrders, updateUserOrderStatus, setUserOrders } from "@/lib/orders";
import { formatProductPrice, resolveStockClass } from "@/lib/catalogue";
import { buildProductSlug } from "@/lib/products";
import useProducts from "@/lib/use-products";
import { RECENTLY_VIEWED_KEY } from "@/lib/engagement";
import { resolveProductImage } from "@/lib/product-image";

const QuickAddDrawer = dynamic(() => import("@/components/quick-add-drawer"), {
  ssr: false,
});

const ACCOUNT_TABS = [
  { slug: "overview", label: "My Account", iconClass: "fa-solid fa-user" },
  { slug: "orders", label: "Orders", iconClass: "fa-solid fa-box" },
  { slug: "wishlist", label: "Wishlist", iconClass: "fa-regular fa-heart" },
  { slug: "voucher", label: "Voucher", iconClass: "fa-solid fa-ticket" },
  { slug: "recent", label: "Recently Viewed", iconClass: "fa-solid fa-clock-rotate-left" },
  { slug: "management", label: "Account Management", iconClass: "fa-solid fa-user-gear" },
  { slug: "addresses", label: "Address Book", iconClass: "fa-solid fa-location-dot" },
  { slug: "newsletter", label: "Newsletter Preferences", iconClass: "fa-solid fa-envelope-open-text" },
];

const FALLBACK_USER = {
  fullName: "MealKit Friend",
  email: "hello@mealkit.ng",
};

const PHONE_COUNTRY_OPTIONS = [
  { code: "+234", label: "Nigeria", flag: "\uD83C\uDDF3\uD83C\uDDEC" },
  { code: "+233", label: "Ghana", flag: "\uD83C\uDDEC\uD83C\uDDED" },
  { code: "+44", label: "United Kingdom", flag: "\uD83C\uDDEC\uD83C\uDDE7" },
  { code: "+1", label: "United States", flag: "\uD83C\uDDFA\uD83C\uDDF8" },
  { code: "+971", label: "United Arab Emirates", flag: "\uD83C\uDDE6\uD83C\uDDEA" },
];

const PHONE_NUMBER_PATTERN = "[0-9]{10}";
const PHONE_NUMBER_REGEX = new RegExp(`^${PHONE_NUMBER_PATTERN}$`);
const SERVICE_CITY = "Ibadan";
const ADDRESS_MIN_LENGTH = 10;

const DEFAULT_TAB = "overview";

const getCurrentTab = (slug) =>
  ACCOUNT_TABS.some((tab) => tab.slug === slug) ? slug : DEFAULT_TAB;

const formatName = (user) => {
  if (!user) return "MealKit Friend";
  if (user.fullName && user.fullName.trim()) return user.fullName.trim();
  if (user.email) return user.email.split("@")[0];
  return "MealKit Friend";
};

const derivePhoneParts = (phone) => {
  if (!phone || typeof phone !== "string") {
    return { country: PHONE_COUNTRY_OPTIONS[0].code, digits: "" };
  }
  const trimmed = phone.trim();
  const matchedCountry = PHONE_COUNTRY_OPTIONS.find((option) => trimmed.startsWith(option.code));
  if (matchedCountry) {
    const digits = trimmed.slice(matchedCountry.code.length).replace(/\D/g, "").slice(0, 10);
    return {
      country: matchedCountry.code,
      digits,
    };
  }
  const fallbackDigits = trimmed.replace(/\D/g, "").slice(-10);
  return {
    country: PHONE_COUNTRY_OPTIONS[0].code,
    digits: fallbackDigits,
  };
};

const formatPhoneDisplay = (phone) => {
  const parts = derivePhoneParts(phone);
  if (!parts.digits) return "Not set";
  return `${parts.country} ${parts.digits}`;
};

const formatAddressDisplay = (user) => {
  if (!user) return "";
  const address = typeof user.address === "string" ? user.address.trim() : "";
  const city = (typeof user.city === "string" ? user.city.trim() : "") || (address ? SERVICE_CITY : "");
  if (!address && !city) return "";
  if (address && city) return `${address}, ${city}`;
  return address || city;
};

const createAddressId = () => `addr_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 6)}`;

const normalizeAddressEntry = (entry) => {
  if (!entry) return null;
  const line = (entry.line || entry.address || "").trim();
  if (!line) return null;
  return {
    id: entry.id || createAddressId(),
    label: (entry.label || entry.title || "Saved address").trim().slice(0, 60) || "Saved address",
    line,
    city: (entry.city || SERVICE_CITY).trim() || SERVICE_CITY,
    createdAt: entry.createdAt || new Date().toISOString(),
  };
};

const ensureUserAddressBook = (user) => {
  if (!user) return null;
  const seen = new Set();
  const addresses = [];
  const addEntry = (entry) => {
    const normalized = normalizeAddressEntry(entry);
    if (!normalized) return;
    const key = normalized.line.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    addresses.push(normalized);
  };

  if (Array.isArray(user.addresses)) {
    user.addresses.forEach(addEntry);
  }

  const legacyLine = typeof user.address === "string" ? user.address.trim() : "";
  if (legacyLine) {
    addEntry({
      id: user.defaultAddressId || createAddressId(),
      label: "Default address",
      line: legacyLine,
      city: user.city || SERVICE_CITY,
    });
  }

  let defaultAddressId = user.defaultAddressId;
  if (!defaultAddressId || !addresses.some((addr) => addr.id === defaultAddressId)) {
    defaultAddressId = addresses[0]?.id || null;
  }

  const primary = defaultAddressId
    ? addresses.find((addr) => addr.id === defaultAddressId) || addresses[0]
    : addresses[0];

  return {
    ...user,
    addresses,
    defaultAddressId: primary ? primary.id : undefined,
    address: primary?.line || "",
    city: primary?.city || (primary ? SERVICE_CITY : ""),
  };
};

function AccountPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [user, setUser] = useState(null);
  const [hydrated, setHydrated] = useState(false);
  const [orders, setOrders] = useState([]);
  const [phoneCountry, setPhoneCountry] = useState(PHONE_COUNTRY_OPTIONS[0].code);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneFeedback, setPhoneFeedback] = useState("");
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const phoneFeedbackTimeoutRef = useRef(null);
  const [addressValue, setAddressValue] = useState("");
  const [addressFeedback, setAddressFeedback] = useState("");
  const [addressFormLabel, setAddressFormLabel] = useState("Home");
  const [addressFormLine, setAddressFormLine] = useState("");
  const [addressFormMessage, setAddressFormMessage] = useState("");
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const addressFeedbackTimeoutRef = useRef(null);
  const addressFormMessageTimeoutRef = useRef(null);
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const { ordered: catalogueList, index: productIndex } = useProducts();
  const [recentlyViewed, setRecentlyViewed] = useState([]);
  const [quickAddProduct, setQuickAddProduct] = useState(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddAnchorRect, setQuickAddAnchorRect] = useState(null);
  const [quickAddAnchorEl, setQuickAddAnchorEl] = useState(null);

  const addressBook = useMemo(() => (Array.isArray(user?.addresses) ? user.addresses : []), [user]);
  const defaultAddress = useMemo(() => {
    if (!addressBook.length) return null;
    return addressBook.find((addr) => addr.id === user?.defaultAddressId) || addressBook[0];
  }, [addressBook, user]);

  const activeTab = useMemo(() => {
    const slug = searchParams?.get("tab");
    return getCurrentTab(slug);
  }, [searchParams]);
  const accountReturnPath = useMemo(() => {
    const base = pathname || "/account";
    const query = searchParams?.toString();
    return query ? `${base}?${query}` : base;
  }, [pathname, searchParams]);
  const signInRedirectHref = useMemo(
    () => buildSignInHref({ tab: "login", next: accountReturnPath, hash: "loginForm" }),
    [accountReturnPath]
  );

  useEffect(() => {
    const stored = ensureUserAddressBook(readStoredUser());
    if (!stored) {
      router.replace(signInRedirectHref);
      return;
    }
    setUser(stored);
    setOrders(readUserOrders(stored));
    persistStoredUser(stored);
    setHydrated(true);
  }, [router, signInRedirectHref]);

  useEffect(() => {
    const handleAuthChange = (event) => {
      const nextUser = ensureUserAddressBook(event?.detail?.user ?? readStoredUser());
      if (!nextUser) {
        router.replace(signInRedirectHref);
        return;
      }
      setUser(nextUser);
      setOrders(readUserOrders(nextUser));
    };

    window.addEventListener(AUTH_EVENT, handleAuthChange);
    return () => {
      window.removeEventListener(AUTH_EVENT, handleAuthChange);
    };
  }, [router, signInRedirectHref]);

  useEffect(() => {
    const handleOrdersChange = () => {
      setOrders(readUserOrders());
    };
    handleOrdersChange();
    window.addEventListener(ORDERS_EVENT, handleOrdersChange);
    return () => {
      window.removeEventListener(ORDERS_EVENT, handleOrdersChange);
    };
  }, []);

  const handleSelectTab = (slug) => {
    const params = new URLSearchParams(searchParams?.toString() || "");
    params.set("tab", slug);
    router.replace(`/account?${params.toString()}`, { scroll: false });
  };

  const handleLogout = () => {
    clearStoredUser();
    router.replace(signInRedirectHref);
  };

  const resolvedUser = user || FALLBACK_USER;
  useEffect(() => {
    const parts = derivePhoneParts(user?.phone);
    setPhoneCountry(parts.country);
    setPhoneNumber(parts.digits);
    setAddressValue(defaultAddress?.line ?? user?.address ?? "");
  }, [user, defaultAddress]);

  useEffect(() => {
    return () => {
      if (phoneFeedbackTimeoutRef.current) {
        clearTimeout(phoneFeedbackTimeoutRef.current);
      }
      if (addressFeedbackTimeoutRef.current) {
        clearTimeout(addressFeedbackTimeoutRef.current);
      }
      if (addressFormMessageTimeoutRef.current) {
        clearTimeout(addressFormMessageTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const history = (() => {
      try {
        const raw = window.localStorage.getItem(RECENTLY_VIEWED_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.map((id) => String(id)) : [];
      } catch {
        return [];
      }
    })();
    if (!history.length) {
      setRecentlyViewed([]);
      return;
    }
    const unique = history.filter((id, index) => history.indexOf(id) === index);
    const picked = [];
    unique.forEach((id) => {
      if (picked.length >= 8) return;
      const product = productIndex.get(String(id));
      if (product) picked.push(product);
    });
    setRecentlyViewed(picked);
  }, [productIndex, catalogueList]);

  const handleQuickAddClose = () => {
    setQuickAddOpen(false);
    setQuickAddProduct(null);
    setQuickAddAnchorRect(null);
    setQuickAddAnchorEl(null);
  };

  const handleQuickAdd = (product, anchorEl) => {
    if (!product) return;
    if (quickAddOpen && quickAddProduct?.id === product.id) {
      handleQuickAddClose();
      return;
    }
    const rect = anchorEl?.getBoundingClientRect ? anchorEl.getBoundingClientRect() : null;
    setQuickAddAnchorEl(anchorEl || null);
    setQuickAddAnchorRect(rect);
    setQuickAddProduct(product);
    setQuickAddOpen(true);
  };

  useEffect(() => {
    if (!quickAddOpen || !quickAddAnchorEl?.getBoundingClientRect) return;
    const updateAnchor = () => {
      try {
        setQuickAddAnchorRect(quickAddAnchorEl.getBoundingClientRect());
      } catch {
        setQuickAddAnchorRect(null);
      }
    };
    updateAnchor();
    window.addEventListener("scroll", updateAnchor, true);
    window.addEventListener("resize", updateAnchor);
    return () => {
      window.removeEventListener("scroll", updateAnchor, true);
      window.removeEventListener("resize", updateAnchor);
    };
  }, [quickAddOpen, quickAddAnchorEl]);

  const schedulePhoneFeedbackClear = () => {
    if (phoneFeedbackTimeoutRef.current) {
      clearTimeout(phoneFeedbackTimeoutRef.current);
    }
    phoneFeedbackTimeoutRef.current = setTimeout(() => {
      setPhoneFeedback("");
      phoneFeedbackTimeoutRef.current = null;
    }, 2500);
  };

  const scheduleAddressFeedbackClear = () => {
    if (addressFeedbackTimeoutRef.current) {
      clearTimeout(addressFeedbackTimeoutRef.current);
    }
    addressFeedbackTimeoutRef.current = setTimeout(() => {
      setAddressFeedback("");
      addressFeedbackTimeoutRef.current = null;
    }, 2500);
  };

  const scheduleAddressFormMessageClear = () => {
    if (addressFormMessageTimeoutRef.current) {
      clearTimeout(addressFormMessageTimeoutRef.current);
    }
    addressFormMessageTimeoutRef.current = setTimeout(() => {
      setAddressFormMessage("");
      addressFormMessageTimeoutRef.current = null;
    }, 2600);
  };

  const handleStartEditPhone = () => {
    if (phoneFeedbackTimeoutRef.current) {
      clearTimeout(phoneFeedbackTimeoutRef.current);
    }
    setPhoneFeedback("");
    const parts = derivePhoneParts(user?.phone);
    setPhoneCountry(parts.country);
    setPhoneNumber(parts.digits);
    setIsEditingPhone(true);
  };

  const handleCancelEditPhone = () => {
    if (phoneFeedbackTimeoutRef.current) {
      clearTimeout(phoneFeedbackTimeoutRef.current);
    }
    setPhoneFeedback("");
    const parts = derivePhoneParts(user?.phone);
    setPhoneCountry(parts.country);
    setPhoneNumber(parts.digits);
    setIsEditingPhone(false);
  };

  const handlePhoneSubmit = (event) => {
    event.preventDefault();
    if (!user) return;
    const digitsOnly = phoneNumber.trim();
    const existingPhone = (user.phone || "").trim();
    if (digitsOnly && !PHONE_NUMBER_REGEX.test(digitsOnly)) {
      setPhoneFeedback("Enter exactly 10 digits for your phone number.");
      return;
    }
    const nextValue = digitsOnly ? `${phoneCountry}${digitsOnly}` : "";
    if (existingPhone === nextValue) {
      setPhoneFeedback("No changes to save");
      schedulePhoneFeedbackClear();
      return;
    }
    const nextUser = { ...user, phone: nextValue };
    setUser(nextUser);
    persistStoredUser(nextUser);
    setPhoneFeedback(digitsOnly ? "Phone number saved" : "Phone number removed");
    setIsEditingPhone(false);
    schedulePhoneFeedbackClear();
  };

  const handleStartEditAddress = () => {
    if (addressFeedbackTimeoutRef.current) {
      clearTimeout(addressFeedbackTimeoutRef.current);
    }
    setAddressFeedback("");
    setAddressValue(defaultAddress?.line ?? user?.address ?? "");
    setIsEditingAddress(true);
  };

  const handleCancelEditAddress = () => {
    if (addressFeedbackTimeoutRef.current) {
      clearTimeout(addressFeedbackTimeoutRef.current);
    }
    setAddressFeedback("");
    setAddressValue(defaultAddress?.line ?? user?.address ?? "");
    setIsEditingAddress(false);
  };

  const handleAddressSubmit = (event) => {
    event.preventDefault();
    if (!user) return;
    const trimmedAddress = addressValue.trim();
    const existingAddress = (user.address || "").trim();
    if (trimmedAddress && trimmedAddress.length < ADDRESS_MIN_LENGTH) {
      setAddressFeedback(`Address should be at least ${ADDRESS_MIN_LENGTH} characters long.`);
      scheduleAddressFeedbackClear();
      return;
    }
    if (existingAddress === trimmedAddress) {
      setAddressFeedback("No changes to save");
      scheduleAddressFeedbackClear();
      return;
    }

    let nextAddresses = Array.isArray(user.addresses) ? [...user.addresses] : [];
    let nextDefaultId = user.defaultAddressId;
    if (trimmedAddress) {
      const existing = nextAddresses.find((addr) => addr.line.toLowerCase() === trimmedAddress.toLowerCase());
      if (existing) {
        nextAddresses = nextAddresses.map((addr) =>
          addr.id === existing.id ? { ...existing, line: trimmedAddress, city: SERVICE_CITY } : addr
        );
        nextDefaultId = existing.id;
      } else {
        const entry = {
          id: createAddressId(),
          label: "Primary address",
          line: trimmedAddress,
          city: SERVICE_CITY,
          createdAt: new Date().toISOString(),
        };
        nextAddresses = [entry, ...nextAddresses];
        nextDefaultId = entry.id;
      }
    } else {
      nextDefaultId = null;
    }

    const nextUser = ensureUserAddressBook({
      ...user,
      addresses: nextAddresses,
      defaultAddressId: nextDefaultId,
      address: trimmedAddress,
      city: trimmedAddress ? SERVICE_CITY : "",
    });
    setUser(nextUser);
    persistStoredUser(nextUser);
    setAddressFeedback(trimmedAddress ? "Delivery address saved" : "Delivery address removed");
    setIsEditingAddress(false);
    scheduleAddressFeedbackClear();
  };

  const handleAddAddressToBook = (event) => {
    event.preventDefault();
    if (!user) return;
    const label = addressFormLabel.trim() || "Saved address";
    const line = addressFormLine.trim();
    if (!line) {
      setAddressFormMessage("Enter an address to save.");
      scheduleAddressFormMessageClear();
      return;
    }
    if (line.length < ADDRESS_MIN_LENGTH) {
      setAddressFormMessage(`Address should be at least ${ADDRESS_MIN_LENGTH} characters.`);
      scheduleAddressFormMessageClear();
      return;
    }
    let nextAddresses = Array.isArray(user.addresses) ? [...user.addresses] : [];
    const city = SERVICE_CITY;
    const existing = nextAddresses.find((addr) => addr.line.toLowerCase() === line.toLowerCase());
    let defaultAddressId = user.defaultAddressId;
    if (existing) {
      nextAddresses = nextAddresses.map((addr) =>
        addr.id === existing.id ? { ...existing, label, line, city } : addr
      );
      defaultAddressId = existing.id;
    } else {
      const entry = {
        id: createAddressId(),
        label,
        line,
        city,
        createdAt: new Date().toISOString(),
      };
      nextAddresses = [entry, ...nextAddresses];
      defaultAddressId = defaultAddressId || entry.id;
    }

    const nextUser = ensureUserAddressBook({ ...user, addresses: nextAddresses, defaultAddressId });
    setUser(nextUser);
    persistStoredUser(nextUser);
    setAddressValue(nextUser.address || "");
    setAddressFeedback("Address saved");
    scheduleAddressFeedbackClear();
    setAddressFormLine("");
    setAddressFormLabel("Home");
    setAddressFormMessage("");
  };

  const handleRemoveAddress = (id) => {
    if (!user) return;
    const nextAddresses = addressBook.filter((addr) => addr.id !== id);
    const nextUser = ensureUserAddressBook({
      ...user,
      addresses: nextAddresses,
      defaultAddressId: user.defaultAddressId === id ? null : user.defaultAddressId,
    });
    setUser(nextUser);
    persistStoredUser(nextUser);
    setAddressValue(nextUser.address || "");
    setAddressFeedback("Address removed");
    scheduleAddressFeedbackClear();
  };

  const handleSetDefaultAddress = (id) => {
    if (!user) return;
    const nextUser = ensureUserAddressBook({ ...user, defaultAddressId: id });
    setUser(nextUser);
    persistStoredUser(nextUser);
    setAddressValue(nextUser.address || "");
    setAddressFeedback("Default address updated");
    scheduleAddressFeedbackClear();
  };

  const presentOrders = useMemo(
    () => orders.filter((order) => order.status !== "delivered"),
    [orders]
  );
  const pastOrders = useMemo(
    () => orders.filter((order) => order.status === "delivered"),
    [orders]
  );

  const handleMarkOrderDelivered = (orderId) => {
    updateUserOrderStatus(orderId, "delivered");
    setOrders(readUserOrders());
  };

  const formatOrderDate = (iso) => {
    if (!iso) return "just now";
    try {
      return new Date(iso).toLocaleString("en-NG", {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return iso;
    }
  };

  const formatStatusLabel = (status) => {
    if (!status) return "processing";
    switch (status) {
      case "awaiting payment":
        return "Awaiting payment";
      case "awaiting delivery":
        return "Awaiting delivery";
      case "processing":
        return "Processing";
      case "delivered":
        return "Delivered";
      default:
        return status;
    }
  };

  const renderOverview = () => {
    const addressDisplay = formatAddressDisplay(resolvedUser);
    return (
      <>
        <div className={styles.cards}>
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Account details</h3>
            <div className={styles.cardBody}>
              <p>{formatName(resolvedUser)}</p>
              <p>{resolvedUser.email}</p>
              <p>{formatPhoneDisplay(resolvedUser.phone)}</p>
              <p>{addressDisplay || "Add a delivery address for faster checkout."}</p>
            </div>
            <Link href="/account?tab=management" className={styles.cardAction}>
              Manage account
            </Link>
          </div>
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Address book</h3>
          <div className={styles.cardBody}>
            <p>Set your default delivery address to speed up checkout.</p>
          </div>
          <Link href="/account?tab=addresses" className={styles.cardAction}>
            Add shipping address
          </Link>
        </div>
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>MealKit store credit</h3>
          <div className={styles.cardBody}>
            <p>Balance: ₦0.00</p>
            <p>Store credit from refunds or loyalty rewards appears here.</p>
          </div>
          <Link href="/account?tab=voucher" className={styles.cardAction}>
            View vouchers
          </Link>
        </div>
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Newsletter preferences</h3>
          <div className={styles.cardBody}>
            <p>Choose the updates you want: weekly offers, seasonal drops, or farmer spotlights.</p>
          </div>
          <Link href="/account?tab=newsletter" className={styles.cardAction}>
            Edit preferences
          </Link>
        </div>
      </div>
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Quick actions</h3>
        <div className={styles.twoColumn}>
          <Link href="/account?tab=orders" className={styles.cardAction}>
            Track recent orders
          </Link>
          <Link href="/shop" className={styles.cardAction}>
            Continue shopping
          </Link>
          <Link href="/checkout" className={styles.cardAction}>
            Book a delivery slot
          </Link>
          <button type="button" className={styles.logoutAction} onClick={handleLogout}>
            <i className="fa-solid fa-arrow-right-from-bracket" aria-hidden="true" />
            Logout
          </button>
        </div>
      </div>
      </>
    );
  };

  const renderEmptyState = (title, body, actionHref, actionLabel) => (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      <div className={styles.sectionEmpty}>
        <i className="fa-regular fa-folder-open" aria-hidden="true" style={{ fontSize: "1.8rem" }} />
        <p>{body}</p>
        {actionHref ? (
          <Link href={actionHref}>{actionLabel}</Link>
        ) : null}
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case "overview":
        return renderOverview();
      case "orders":
        return (
          <>
            <div className={styles.section}>
              <div className={styles.sectionHeader} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h3 className={styles.sectionTitle}>Current orders</h3>
                <button
                  type="button"
                  className={styles.orderActionButton}
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/orders', { cache: 'no-store' });
                      const payload = await res.json().catch(() => ({}));
                      if (!res.ok) {
                        console.warn('Failed to fetch orders', payload?.error || res.statusText);
                        return;
                      }
                      const apiOrders = Array.isArray(payload?.orders) ? payload.orders : [];
                      const mapped = apiOrders.map((o) => ({
                        orderId: String(o.id ?? ''),
                        placedAt: o.createdAt || new Date().toISOString(),
                        status: o.status || (o.paymentStatus === 'paid' ? 'awaiting delivery' : 'processing'),
                        summary: { total: Number(o.total) || 0 },
                        items: Array.isArray(o.items) ? o.items : [],
                      }));
                      setUserOrders(mapped);
                      setOrders(mapped);
                    } catch (e) {
                      console.warn('Unable to sync orders', e);
                    }
                  }}
                >
                  Refresh from server
                </button>
              </div>
              {presentOrders.length ? (
                <div className={styles.list}>
                  {presentOrders.map((order) => (
                    <div className={styles.listItem} key={order.orderId}>
                      <div className={styles.orderInfo}>
                        <strong>Order {order.orderId}</strong>
                        <span>Placed {formatOrderDate(order.placedAt)}</span>
                        <span>Total {formatProductPrice(order.summary?.total || 0)}</span>
                        <span>Status: {formatStatusLabel(order.status)}</span>
                        {expandedOrderId === order.orderId ? (
                          <OrderTracker order={order} />
                        ) : null}
                      </div>
                      <div className={styles.orderActions}>
                        <button
                          type="button"
                          className={styles.orderActionButton}
                          aria-expanded={expandedOrderId === order.orderId}
                          onClick={() => setExpandedOrderId(expandedOrderId === order.orderId ? null : order.orderId)}
                        >
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <span>{expandedOrderId === order.orderId ? "Hide details" : "View details"}</span>
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                              aria-hidden="true"
                              style={{ transition: "transform .2s ease", transform: expandedOrderId === order.orderId ? "rotate(180deg)" : "rotate(0deg)" }}
                            >
                              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </span>
                        </button>
                        <button
                          type="button"
                          className={styles.orderActionButton}
                          onClick={() => handleMarkOrderDelivered(order.orderId)}
                        >
                          Mark as delivered
                        </button>
                      </div>
                      {expandedOrderId === order.orderId ? (
                        <div style={{ marginTop: 12, borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
                          <strong style={{ display: "block", marginBottom: 8 }}>Items</strong>
                          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
                            {(Array.isArray(order.items) ? order.items : []).map((it, idx) => (
                              <li key={idx} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                {it?.product?.image ? (
                                  <Image
                                    src={resolveProductImage(it.product.image)}
                                    alt=""
                                    width={44}
                                    height={44}
                                    sizes="44px"
                                    loading="lazy"
                                    style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 6, border: "1px solid #e5e7eb" }}
                                  />
                                ) : (
                                  <div style={{ width: 44, height: 44, borderRadius: 6, border: "1px solid #e5e7eb", background: "#f8fafc" }} />
                                )}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {it?.product?.title || it?.product?.name || `Item ${idx + 1}`}
                                  </div>
                                  <div style={{ color: "#6b7280", fontSize: 13 }}>
                                    {it?.product?.unit ? `${it.product.unit} • ` : ""}Qty {it?.quantity ?? 0}
                                  </div>
                                </div>
                                <div style={{ textAlign: "right" }}>
                                  <div style={{ fontWeight: 600 }}>{formatProductPrice(Number(it?.lineTotal) || (Number(it?.unitPrice) || 0) * (Number(it?.quantity) || 0))}</div>
                                  <div style={{ color: "#6b7280", fontSize: 12 }}>{formatProductPrice(Number(it?.unitPrice) || 0)} each</div>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.sectionEmpty}>
                  <i className="fa-solid fa-box" aria-hidden="true" style={{ fontSize: "1.4rem" }} />
                  <p>No active orders at the moment.</p>
                  <Link href="/shop">Add fresh items to your cart</Link>
                </div>
              )}
            </div>

            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Past orders</h3>
              {pastOrders.length ? (
                <div className={styles.list}>
                  {pastOrders.map((order) => (
                    <div className={styles.listItem} key={order.orderId}>
                      <div className={styles.orderInfo}>
                        <strong>Order {order.orderId}</strong>
                        <span>Delivered {formatOrderDate(order.placedAt)}</span>
                        <span>Total {formatProductPrice(order.summary?.total || 0)}</span>
                        {expandedOrderId === order.orderId ? (
                          <OrderTracker order={{ ...order, status: "delivered" }} />
                        ) : null}
                      </div>
                      <div className={styles.orderActions}>
                        <button
                          type="button"
                          className={styles.orderActionButton}
                          aria-expanded={expandedOrderId === order.orderId}
                          onClick={() => setExpandedOrderId(expandedOrderId === order.orderId ? null : order.orderId)}
                        >
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <span>{expandedOrderId === order.orderId ? "Hide details" : "View details"}</span>
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                              aria-hidden="true"
                              style={{ transition: "transform .2s ease", transform: expandedOrderId === order.orderId ? "rotate(180deg)" : "rotate(0deg)" }}
                            >
                              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </span>
                        </button>
                        <Link href="/shop" className={styles.cardAction}>
                          Reorder items
                        </Link>
                      </div>
                      {expandedOrderId === order.orderId ? (
                        <div style={{ marginTop: 12, borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
                          <strong style={{ display: "block", marginBottom: 8 }}>Items</strong>
                          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
                            {(Array.isArray(order.items) ? order.items : []).map((it, idx) => (
                              <li key={idx} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                {it?.product?.image ? (
                                  <Image
                                    src={resolveProductImage(it.product.image)}
                                    alt=""
                                    width={44}
                                    height={44}
                                    sizes="44px"
                                    loading="lazy"
                                    style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 6, border: "1px solid #e5e7eb" }}
                                  />
                                ) : (
                                  <div style={{ width: 44, height: 44, borderRadius: 6, border: "1px solid #e5e7eb", background: "#f8fafc" }} />
                                )}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {it?.product?.title || it?.product?.name || `Item ${idx + 1}`}
                                  </div>
                                  <div style={{ color: "#6b7280", fontSize: 13 }}>
                                    {it?.product?.unit ? `${it.product.unit} • ` : ""}Qty {it?.quantity ?? 0}
                                  </div>
                                </div>
                                <div style={{ textAlign: "right" }}>
                                  <div style={{ fontWeight: 600 }}>{formatProductPrice(Number(it?.lineTotal) || (Number(it?.unitPrice) || 0) * (Number(it?.quantity) || 0))}</div>
                                  <div style={{ color: "#6b7280", fontSize: 12 }}>{formatProductPrice(Number(it?.unitPrice) || 0)} each</div>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.sectionEmpty}>
                  <i className="fa-regular fa-calendar" aria-hidden="true" style={{ fontSize: "1.4rem" }} />
                  <p>No completed orders yet. Once an order is marked delivered it will appear here.</p>
                </div>
              )}
            </div>
          </>
        );
      case "wishlist":
        return renderEmptyState(
          "Wishlist",
          "Save seasonal bundles or special treats to your wishlist for easy reordering.",
          "/shop",
          "Browse catalogue"
        );
      case "voucher":
        return (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Voucher wallet</h3>
            <div className={styles.list}>
              <div className={styles.listItem}>
                <span>Store credit</span>
                <span>₦0.00</span>
              </div>
              <div className={styles.sectionEmpty}>
                <i className="fa-solid fa-ticket" aria-hidden="true" style={{ fontSize: "1.6rem" }} />
                <p>No vouchers saved yet. Apply promo codes on the cart page to store them here.</p>
                <Link href="/cart">Go to cart</Link>
              </div>
            </div>
          </div>
        );
      case "recent":
        return (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Recently viewed</h3>
            {recentlyViewed.length ? (
              <div className="product-card-grid" style={{ gap: "1rem" }}>
                {recentlyViewed.map((product) => {
                  const href = buildProductSlug(product) ? `/products/${buildProductSlug(product)}` : "/shop";
                  const image =
                    resolveProductImage(product.image, product.image_url, product.thumbnail);
                  const price = Number(product.price ?? product.unit_price ?? product.unitPrice ?? 0);
                  const stockClass = resolveStockClass(product.stock);
                  const isUnavailable = stockClass === "is-unavailable";
                  return (
                    <article key={product.id} className="product-card product-card--with-cta" style={{ maxWidth: 260 }}>
                      <Link href={href} className="product-card__link">
                        <div>
                          <div className="product-card__media">
                            <Image
                              src={resolveProductImage(image)}
                              alt={product.name || "Recently viewed product"}
                              className="productImg"
                              width={140}
                              height={140}
                              sizes="(max-width: 768px) 120px, 140px"
                              loading="lazy"
                            />
                            {isUnavailable ? (
                              <div className="product-card__overlay" aria-hidden="true">
                                Out of Stock
                              </div>
                            ) : null}
                          </div>
                          <div className="product-card__body">
                            <h4>{product.name || "Fresh produce"}</h4>
                            <p className="product-card__price">{formatProductPrice(price)}</p>
                            {product.unit ? <p className="product-card__unit">{product.unit}</p> : null}
                          </div>
                        </div>
                      </Link>
                      <div className="product-card__cta">
                        <button
                          type="button"
                          className="product-card__cta-button"
                          onClick={(event) => handleQuickAdd(product, event.currentTarget)}
                          disabled={isUnavailable}
                          aria-label={`Add ${product.name || "item"} to cart`}
                        >
                          <span className="product-card__cta-icon" aria-hidden="true">
                            <svg
                              width="24"
                              height="24"
                              viewBox="0 0 24 24"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <circle cx="8" cy="19" r="1.5" fill="currentColor" />
                              <circle cx="17" cy="19" r="1.5" fill="currentColor" />
                              <path
                                d="M3 5H5L6.2 13.1C6.33347 13.983 7.07703 14.6425 7.96984 14.6425H17.4C18.1232 14.6425 18.753 14.1615 18.9363 13.4605L21 6.14246H6"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </span>
                          <span className="product-card__cta-label">
                            {isUnavailable ? "Out of stock" : "Add to cart"}
                          </span>
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className={styles.sectionEmpty}>
                <i className="fa-regular fa-folder-open" aria-hidden="true" style={{ fontSize: "1.8rem" }} />
                <p>Items you view will appear here so you can add them to cart in a tap.</p>
                <Link href="/shop">Start exploring</Link>
              </div>
            )}
          </div>
        );
      case "management": {
        const addressDisplay = formatAddressDisplay(resolvedUser);
        return (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Account management</h3>
            <div className={styles.list}>
              <div className={styles.listItem}>
                <span>Full name</span>
                <span>{formatName(resolvedUser)}</span>
              </div>
              <div className={styles.listItem}>
                <span>Email</span>
                <span>{resolvedUser.email}</span>
              </div>
              <div className={styles.listItem}>
                <span>Phone</span>
                <div className={styles.listItemValue}>
                  <span>{formatPhoneDisplay(resolvedUser.phone)}</span>
                  <div className={styles.listItemControls}>
                    <button
                      type="button"
                      className={styles.profileEditButton}
                      onClick={handleStartEditPhone}
                    >
                      {resolvedUser.phone ? "Edit" : "Add"}
                    </button>
                    {!isEditingPhone && phoneFeedback ? (
                      <span className={styles.profileMessage} role="status" aria-live="polite">
                        {phoneFeedback}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className={styles.listItem}>
                <span>Delivery address</span>
                <div className={styles.listItemValue}>
                  <span>{addressDisplay || "Not set"}</span>
                  <div className={styles.listItemControls}>
                    <button
                      type="button"
                      className={styles.profileEditButton}
                      onClick={handleStartEditAddress}
                    >
                      {addressDisplay ? "Edit" : "Add"}
                    </button>
                    {!isEditingAddress && addressFeedback ? (
                      <span className={styles.profileMessage} role="status" aria-live="polite">
                        {addressFeedback}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className={styles.listItem}>
                <span>Password</span>
                <Link href={signInRedirectHref}>Change password</Link>
              </div>
            </div>
            {isEditingPhone ? (
              <form className={styles.profileForm} onSubmit={handlePhoneSubmit}>
                <div className={styles.profileField}>
                  <label htmlFor="account-phone">Phone number</label>
                  <div className={styles.profilePhoneGroup}>
                    <label className="sr-only" htmlFor="account-phone-country">
                      Country code
                    </label>
                    <select
                      id="account-phone-country"
                      name="account-phone-country"
                      className={styles.profilePhoneSelect}
                      value={phoneCountry}
                      onChange={(event) => {
                        setPhoneCountry(event.target.value);
                        if (phoneFeedback) {
                          setPhoneFeedback("");
                        }
                      }}
                    >
                      {PHONE_COUNTRY_OPTIONS.map((option) => (
                        <option key={option.code} value={option.code}>
                          {`${option.flag} ${option.code}`}
                        </option>
                      ))}
                    </select>
                    <input
                      id="account-phone"
                      type="tel"
                      name="account-phone"
                      className={styles.profilePhoneInput}
                      value={phoneNumber}
                      onChange={(event) => {
                        setPhoneNumber(event.target.value.replace(/\D/g, "").slice(0, 10));
                        if (phoneFeedback) {
                          setPhoneFeedback("");
                        }
                      }}
                      placeholder="8120000000"
                      autoComplete="tel"
                      inputMode="tel"
                      pattern={PHONE_NUMBER_PATTERN}
                      maxLength={10}
                    />
                  </div>
                  <p className={styles.profileHint}>We use this number for delivery updates and order support.</p>
                </div>
                <div className={styles.profileActions}>
                  <button type="submit" className={styles.profileSubmit}>
                    Save changes
                  </button>
                  <button type="button" className={styles.profileCancel} onClick={handleCancelEditPhone}>
                    Cancel
                  </button>
                {isEditingPhone && phoneFeedback ? (
                  <span className={styles.profileMessage} role="status" aria-live="polite">
                    {phoneFeedback}
                  </span>
                ) : null}
              </div>
            </form>
          ) : null}
            {isEditingAddress ? (
              <form className={styles.profileForm} onSubmit={handleAddressSubmit}>
                <div className={styles.profileField}>
                  <label htmlFor="account-address">Delivery address</label>
                  <textarea
                    id="account-address"
                    name="account-address"
                    className={styles.profileTextarea}
                    value={addressValue}
                    onChange={(event) => {
                      setAddressValue(event.target.value);
                      if (addressFeedback) {
                        setAddressFeedback("");
                      }
                    }}
                    placeholder="Street, estate, landmark"
                    rows={3}
                    minLength={ADDRESS_MIN_LENGTH}
                    title={`Address should be at least ${ADDRESS_MIN_LENGTH} characters long.`}
                  />
                  <p className={styles.profileHint}>We&apos;ll default to this address for future orders.</p>
                </div>
                <div className={styles.profileActions}>
                  <button type="submit" className={styles.profileSubmit}>
                    Save changes
                  </button>
                  <button type="button" className={styles.profileCancel} onClick={handleCancelEditAddress}>
                    Cancel
                  </button>
                  {isEditingAddress && addressFeedback ? (
                    <span className={styles.profileMessage} role="status" aria-live="polite">
                      {addressFeedback}
                    </span>
                  ) : null}
                </div>
              </form>
            ) : null}
          </div>
        );
      }
      case "addresses":
        return (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h3 className={styles.sectionTitle}>Address book</h3>
                <p className={styles.cardBody}>
                  Save multiple delivery locations and pick any of them quickly during checkout.
                </p>
              </div>
              <span className={styles.addressBadge}>{addressBook.length} saved</span>
            </div>
            {addressBook.length ? (
              <div className={styles.addressList}>
                {addressBook.map((addr) => {
                  const isDefault = addr.id === defaultAddress?.id;
                  return (
                    <div key={addr.id} className={styles.addressCard}>
                      <div className={styles.addressMeta}>
                        <div className={styles.addressLabelRow}>
                          <span className={styles.addressLabel}>{addr.label || "Saved address"}</span>
                          {isDefault ? <span className={styles.addressBadgeSecondary}>Default</span> : null}
                        </div>
                        <p className={styles.addressLine}>
                          {addr.line}
                          {addr.city ? `, ${addr.city}` : ""}
                        </p>
                      </div>
                      <div className={styles.addressActions}>
                        {isDefault ? (
                          <span className={styles.addressHint}>Used automatically at checkout</span>
                        ) : (
                          <button
                            type="button"
                            className={styles.profileEditButton}
                            onClick={() => handleSetDefaultAddress(addr.id)}
                          >
                            Use at checkout
                          </button>
                        )}
                        <button
                          type="button"
                          className={styles.addressRemove}
                          onClick={() => handleRemoveAddress(addr.id)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={styles.sectionEmpty}>
                <i className="fa-regular fa-folder-open" aria-hidden="true" style={{ fontSize: "1.6rem" }} />
                <p>Add addresses you use often. You can still type a brand new one during checkout.</p>
              </div>
            )}
            {addressFeedback ? (
              <span className={styles.profileMessage} role="status" aria-live="polite">
                {addressFeedback}
              </span>
            ) : null}
            <form className={`${styles.profileForm} ${styles.addressForm}`} onSubmit={handleAddAddressToBook}>
              <div className={styles.profileField}>
                <label htmlFor="account-address-label">Label</label>
                <input
                  id="account-address-label"
                  name="account-address-label"
                  className={styles.profileInput}
                  value={addressFormLabel}
                  onChange={(event) => {
                    setAddressFormLabel(event.target.value);
                    if (addressFormMessage) setAddressFormMessage("");
                  }}
                  placeholder="Home, Office, Family house"
                />
              </div>
              <div className={styles.profileField}>
                <label htmlFor="account-address-line">Address</label>
                <textarea
                  id="account-address-line"
                  name="account-address-line"
                  className={styles.profileTextarea}
                  value={addressFormLine}
                  onChange={(event) => {
                    setAddressFormLine(event.target.value);
                    if (addressFormMessage) setAddressFormMessage("");
                  }}
                  placeholder="Street, estate, landmark"
                  rows={3}
                  minLength={ADDRESS_MIN_LENGTH}
                  required
                />
                <p className={styles.profileHint}>
                  We&apos;ll keep this ready at checkout. You can still type a fresh address if you prefer.
                </p>
              </div>
              <div className={styles.profileActions}>
                <button type="submit" className={styles.profileSubmit}>
                  Save to address book
                </button>
                <button
                  type="button"
                  className={styles.profileCancel}
                  onClick={() => {
                    setAddressFormLine("");
                    setAddressFormLabel("Home");
                    setAddressFormMessage("");
                  }}
                >
                  Clear
                </button>
                {addressFormMessage ? (
                  <span className={styles.profileMessage} role="status" aria-live="polite">
                    {addressFormMessage}
                  </span>
                ) : null}
              </div>
            </form>
          </div>
        );
      case "newsletter":
        return (
          <div className={`${styles.section}`}>
            <h3 className={styles.sectionTitle}>Newsletter preferences</h3>
            <p className={styles.cardBody}>
              You&apos;re currently subscribed to product updates and weekly offers. Toggle categories below to tailor what
              hits your inbox.
            </p>
            <div className={styles.list}>
              <div className={styles.listItem}>
                <span>Weekly offers & flash sales</span>
                <span>Subscribed</span>
              </div>
              <div className={styles.listItem}>
                <span>Seasonal farmer drops</span>
                <span>Subscribed</span>
              </div>
              <div className={styles.listItem}>
                <span>Chef recipes & meal plans</span>
                <span>Unsubscribed</span>
              </div>
            </div>
            <Link href="/help-center" className={styles.cardAction}>
              Update with concierge
            </Link>
          </div>
        );
      default:
        return renderOverview();
    }
  };

  if (!hydrated) {
    return (
      <main className={styles.page}>
        <div className={styles.layout}>
          <div className={styles.sidebar}>
            <span className={styles.sidebarHeading}>Loading</span>
          </div>
          <div className={styles.skeleton}>Preparing your account...</div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.layout}>
        <nav className={styles.sidebar} aria-label="Account sections">
          <span className={styles.sidebarHeading}>My account</span>
          <ul className={styles.navList}>
            {ACCOUNT_TABS.map((tab) => (
              <li
                key={tab.slug}
                className={`${styles.navItem}${activeTab === tab.slug ? ` ${styles.navItemActive}` : ""}`}
              >
                <button type="button" onClick={() => handleSelectTab(tab.slug)}>
                  <i className={tab.iconClass} aria-hidden="true" />
                  <span>{tab.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <section className={styles.content} aria-live="polite">
          <header className={styles.header}>
            <span className={styles.headerEyebrow}>Account</span>
            <h1 className={styles.headerTitle}>
              {ACCOUNT_TABS.find((tab) => tab.slug === activeTab)?.label ?? "My Account"}
            </h1>
            <p className={styles.headerSubtitle}>Manage deliveries, preferences, and saved details from one place.</p>
          </header>

          {renderContent()}
        </section>
      </div>
      <QuickAddDrawer
        product={quickAddProduct}
        isOpen={quickAddOpen}
        onClose={handleQuickAddClose}
        variant="dropdown"
        anchorRect={quickAddAnchorRect}
        anchorEl={quickAddAnchorEl}
      />
    </main>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={<div>Loading account...</div>}>
      <AccountPageContent />
    </Suspense>
  );
}

// Lightweight order tracking timeline component
function OrderTracker({ order }) {
  const steps = [
    { key: "processing", label: "Order received" },
    { key: "packed", label: "Packed" },
    { key: "awaiting delivery", label: "Out for delivery" },
    { key: "delivered", label: "Delivered" },
  ];

  const statusKey = String(order?.status || "processing").toLowerCase();
  const currentIndex = (() => {
    if (statusKey === "delivered") return 3;
    if (statusKey.includes("awaiting") && statusKey.includes("delivery")) return 2;
    // Treat any other non-delivered as step 1 or 0
    return 1; // packed
  })();

  const etaText = (() => {
    if (currentIndex >= 3) return "Delivered";
    if (currentIndex === 2) return "ETA: within 1–2 hours";
    return "Preparing your items";
  })();

  return (
    <div className={styles.orderTracker} role="status" aria-live="polite">
      <div className={styles.orderTrackerHeader}>
        <strong>Tracking</strong>
        <span className={styles.orderTrackerEta}>{etaText}</span>
      </div>
      <div className={styles.orderTrackerSteps}>
        {steps.map((step, index) => {
          const className = [
            styles.orderTrackerStep,
            index === currentIndex ? styles.isActive : "",
            index < currentIndex ? styles.isDone : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <div key={step.key} className={className}>
              {step.label}
            </div>
          );
        })}
      </div>
      <p className={styles.orderTrackerNote}>Order {order?.orderId}</p>
    </div>
  );
}
