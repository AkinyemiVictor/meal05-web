"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  IconAddressBook,
  IconArrowDownLeft,
  IconBell,
  IconChevronRight,
  IconCircleCheck,
  IconClock,
  IconCopy,
  IconFileDescription,
  IconGift,
  IconHeart,
  IconHelpCircle,
  IconHourglass,
  IconLock,
  IconLogout,
  IconMail,
  IconMapPin,
  IconMessageCircle,
  IconPackage,
  IconReceiptRefund,
  IconRefresh,
  IconShieldCheck,
  IconShoppingBag,
  IconUser,
  IconUserCog,
  IconUsersPlus,
  IconWallet,
} from "@tabler/icons-react";

import styles from "./account.module.css";
import ProductCard from "@/components/product-card";
import { AUTH_EVENT, clearStoredUser, deriveStoredUserFromAuthUser, persistStoredUser, readStoredUser } from "@/lib/auth";
import { buildSignInHref } from "@/lib/auth-redirect";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser-client";
import { ORDERS_EVENT, readUserOrders, setUserOrders } from "@/lib/orders";
import { CART_UPDATED_EVENT, readCartItems, writeCartItems } from "@/lib/cart-storage";
import { addAuthenticatedCartItem } from "@/lib/cart-sync";
import { formatProductPrice } from "@/lib/catalogue";
import { useCatalogProducts, useProductsByIds } from "@/lib/use-catalog-products";
import { RECENTLY_VIEWED_KEY } from "@/lib/engagement";
import { FAVORITES_UPDATED_EVENT, loadFavoriteIds } from "@/lib/favorites-client";
import { resolveProductImage } from "@/lib/product-image";
import {
  DEFAULT_PHONE_COUNTRY_CODE,
  PHONE_COUNTRY_OPTIONS,
  findPhoneCountryByDialCode,
} from "@/lib/phone-country-options";

const QuickAddDrawer = dynamic(() => import("@/components/quick-add-drawer"), {
  ssr: false,
});

const ACCOUNT_TABS = [
  { slug: "overview", label: "My Account", icon: IconUser },
  { slug: "orders", label: "Orders", icon: IconPackage },
  { slug: "balance", label: "Meal05 Balance", icon: IconWallet },
  { slug: "refunds", label: "Refunds", icon: IconReceiptRefund },
  { slug: "referrals", label: "Refer & Earn", icon: IconUsersPlus },
  { slug: "favorites", label: "Favorites", icon: IconHeart },
  { slug: "voucher", label: "Voucher", icon: IconGift },
  { slug: "recent", label: "Recently Viewed", icon: IconClock },
  { slug: "management", label: "Account Management", icon: IconUserCog },
  { slug: "addresses", label: "Address Book", icon: IconAddressBook },
  { slug: "newsletter", label: "Newsletter Preferences", icon: IconMail },
  { slug: "faqs", label: "FAQs", icon: IconHelpCircle },
  { slug: "help", label: "Help & Support", icon: IconMessageCircle },
  { slug: "notifications", label: "Notification Settings", icon: IconBell },
  { slug: "legal", label: "Legal & System", icon: IconFileDescription },
];

const ACCOUNT_SUBTITLES = {
  overview: "Manage deliveries, preferences, and saved details from one place.",
  orders: "Track active deliveries and buy previous market runs again in a tap.",
  balance: "Add money, review balance, and track closed-loop Meal05 Balance activity.",
  refunds: "Review refund requests and wallet reversals tied to your orders.",
  referrals: "Invite friends and keep track of Meal05 referral rewards.",
  favorites: "Keep frequently bought items close for your next market run.",
  voucher: "Your store credit and available discount codes live here.",
  recent: "Pick up where you left off with items you recently browsed.",
  management: "Update your personal details, contact info, and password.",
  addresses: "Save multiple delivery locations and choose one at checkout.",
  newsletter: "Choose exactly which updates land in your inbox.",
  faqs: "Answers to common Meal05 shopping, delivery, and payment questions.",
  help: "Get support for orders, delivery, refunds, and account issues.",
  notifications: "Choose the alerts you want from Meal05.",
  legal: "Review policies, terms, and app information.",
};

const ACCOUNT_ROUTE_TO_TAB = {
  profile: "management",
  addresses: "addresses",
  orders: "orders",
  wallet: "balance",
  refunds: "refunds",
  referrals: "referrals",
  faqs: "faqs",
  help: "help",
  notifications: "notifications",
  legal: "legal",
  favorites: "favorites",
};

const TAB_TO_ACCOUNT_ROUTE = {
  overview: "",
  management: "profile",
  addresses: "addresses",
  orders: "orders",
  balance: "wallet",
  refunds: "refunds",
  referrals: "referrals",
  faqs: "faqs",
  help: "help",
  notifications: "notifications",
  legal: "legal",
  favorites: "favorites",
  voucher: "voucher",
  recent: "recent",
  newsletter: "newsletter",
};

const LEGACY_TAB_TO_ACCOUNT_ROUTE = {
  management: "profile",
  balance: "wallet",
  cart: "",
  ...TAB_TO_ACCOUNT_ROUTE,
};

const getRouteTab = (pathname) => {
  const parts = String(pathname || "").split("/").filter(Boolean);
  if (parts[0] !== "account" || !parts[1]) return "";
  return ACCOUNT_ROUTE_TO_TAB[parts[1]] || getCurrentTab(parts[1]);
};

const getAccountRoute = (tab) => {
  const route = TAB_TO_ACCOUNT_ROUTE[tab] ?? tab;
  return route ? `/account/${route}` : "/account";
};

const FALLBACK_USER = {
  fullName: "Customer",
  email: "",
};

const PHONE_INPUT_PATTERN = "[0-9\\s().-]{4,24}";
const PHONE_NUMBER_PATTERN = "[0-9]{4,14}";
const PHONE_NUMBER_REGEX = new RegExp(`^${PHONE_NUMBER_PATTERN}$`);
const PHONE_INPUT_REGEX = new RegExp(`^${PHONE_INPUT_PATTERN}$`);
const SERVICE_CITY = "Ibadan";
const ADDRESS_MIN_LENGTH = 10;

const DEFAULT_TAB = "overview";

const getCurrentTab = (slug) =>
  ACCOUNT_TABS.some((tab) => tab.slug === slug) ? slug : DEFAULT_TAB;

const formatName = (user) => {
  if (!user) return "Customer";
  if (user.fullName && user.fullName.trim()) return user.fullName.trim();
  if (user.email) return user.email.split("@")[0];
  return "Customer";
};

const formatMoney = (amount, currency = "NGN") =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: String(currency || "NGN").toUpperCase(),
    maximumFractionDigits: 0,
  }).format(Number(amount) || 0);

const formatWalletReason = (value) =>
  String(value || "")
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Meal05 Balance";

const formatWalletTransactionLabel = (entry) => {
  const reason = String(entry?.reason || "").trim().toLowerCase();
  if (entry?.wallet_topup_id || reason === "topup") return "Wallet deposit";
  if (entry?.order_id || reason === "purchase") return "Checkout paid with Meal05 Balance";
  if (reason === "refund") return "Refund to Meal05 Balance";
  if (reason === "overpayment_change") return "Order change credited to Meal05 Balance";
  return formatWalletReason(reason);
};

const derivePhoneParts = (phone) => {
  if (!phone || typeof phone !== "string") {
    return { country: DEFAULT_PHONE_COUNTRY_CODE, digits: "" };
  }
  const trimmed = phone.trim();
  const matchedCountry = findPhoneCountryByDialCode(trimmed);
  if (matchedCountry) {
    const digits = trimmed.slice(matchedCountry.code.length).replace(/\D/g, "").slice(0, 14);
    return {
      country: matchedCountry.code,
      digits,
    };
  }
  const fallbackDigits = trimmed.replace(/\D/g, "").slice(-14);
  return {
    country: DEFAULT_PHONE_COUNTRY_CODE,
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

const mapApiOrder = (order) => ({
  orderId: String(order?.id ?? ""),
  orderReference: String(order?.orderReference || order?.id || ""),
  placedAt: order?.createdAt || new Date().toISOString(),
  status: order?.status || "pending",
  paymentStatus: order?.paymentStatus || "pending",
  paymentMethod: order?.paymentMethod || "",
  paymentReference: order?.paymentReference || "",
  availabilityRequestId: order?.availabilityRequestId || null,
  latestPayment: order?.latestPayment || null,
  deliveryStatus: order?.deliveryStatus || "",
  deliveryAddress: order?.deliveryAddress || "",
  summary: { total: Number(order?.total) || 0 },
  items: Array.isArray(order?.items) ? order.items : [],
});

const normaliseOrderQuantity = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 1;
  return Math.max(1, Math.round(numeric));
};

const ORDER_SIZE_PREFERENCE_LABELS = {
  best_available: "Best available",
  smaller: "Smaller pieces",
  medium: "Medium pieces",
  larger: "Larger pieces",
};

const ORDER_LINE_QUANTITY_FORMATTER = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 3 });
const formatOrderLineQuantity = (value) => ORDER_LINE_QUANTITY_FORMATTER.format(Number(value) || 0);

function OrderItemsList({ items }) {
  const lines = Array.isArray(items) ? items : [];
  return (
    <section className={styles.orderItemsBlock} aria-label="Items ordered">
      <div className={styles.orderItemsHeading}>
        <h4>Items ordered</h4>
        <span>{lines.length} line{lines.length === 1 ? "" : "s"}</span>
      </div>
      {lines.length ? (
        <ul className={styles.orderItemsList}>
          {lines.map((item, index) => {
            const name = item?.product?.title || item?.product?.name || "Archived product";
            const option = String(item?.variantName || item?.variant_name || "").trim();
            const preference = ORDER_SIZE_PREFERENCE_LABELS[String(item?.sizePreference || "").toLowerCase()] || "";
            const quantity = formatOrderLineQuantity(item?.quantity);
            const image = resolveProductImage(item?.product?.image);
            return (
              <li key={`${item?.variantId || item?.productId || "line"}-${index}`}>
                <div className={styles.orderItemProduct}>
                  <div className={styles.orderItemImage}>
                    <Image src={image} alt="" fill sizes="56px" className={styles.orderItemImageAsset} />
                  </div>
                  <div className={styles.orderItemIdentity}>
                    <strong>{name}</strong>
                    {option ? <span>Option: {option}</span> : null}
                    {preference ? <span>Size preference: {preference}</span> : null}
                    {item?.fulfillmentNote ? <span>Note: {item.fulfillmentNote}</span> : null}
                  </div>
                </div>
                <div className={styles.orderItemPrice}>
                  <span>Quantity: {quantity}</span>
                  <span>{formatProductPrice(item?.unitPrice || 0)} each</span>
                  <strong>{formatProductPrice(item?.lineTotal || 0)}</strong>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={styles.orderItemsEmpty}>Item details are unavailable for this order.</p>
      )}
    </section>
  );
}

const getCartLineKey = (item) =>
  String(item?.variantId || item?.id || item?.productId || "").trim();

const buildCartItemFromOrderItem = (item, productIndex) => {
  if (!item || typeof item !== "object") return null;
  const productId = item.productId ?? item.product_id ?? item.product?.id ?? null;
  if (productId == null) return null;
  const variantId = item.variantId ?? item.variant_id ?? productId;
  const product = productIndex?.get?.(String(productId)) || null;
  const quantity = normaliseOrderQuantity(item.quantity);
  const productName = item.product?.title || item.product?.name || product?.name || `Product ${productId}`;
  const unit = item.product?.unit || product?.unit || "";
  const price = Number(item.unitPrice ?? item.unit_price ?? product?.price ?? 0) || 0;

  return {
    id: String(variantId),
    productId: String(productId),
    variantId: String(variantId),
    variantName: item.variantName || item.variant_name || product?.variantName || unit || "Default",
    name: productName,
    category: product?.category || "",
    categorySlug: product?.categorySlug || "",
    packaging: item.packaging || product?.packaging || "",
    unit: unit || "unit",
    price,
    orderSize: 1,
    orderCount: quantity,
    quantity,
    stock: product?.stock,
    note: "Reordered from account",
    image: resolveProductImage(item.product?.image, product?.image, product?.mainImageUrl),
  };
};

const mergeCartItems = (currentItems, incomingItems) => {
  const merged = Array.isArray(currentItems) ? currentItems.map((item) => ({ ...item })) : [];
  (Array.isArray(incomingItems) ? incomingItems : []).forEach((incoming) => {
    if (!incoming) return;
    const incomingKey = getCartLineKey(incoming);
    const incomingProductKey = String(incoming.productId || incoming.id || "").trim();
    const index = merged.findIndex((item) => {
      const itemKey = getCartLineKey(item);
      const itemProductKey = String(item.productId || item.id || "").trim();
      return itemKey === incomingKey || (!incoming.variantId && incomingProductKey && itemProductKey === incomingProductKey);
    });
    if (index >= 0) {
      const current = merged[index];
      const nextCount = normaliseOrderQuantity(current.orderCount ?? current.quantity) + normaliseOrderQuantity(incoming.orderCount ?? incoming.quantity);
      merged[index] = { ...current, ...incoming, orderCount: nextCount, quantity: nextCount, note: current.note || incoming.note };
    } else {
      merged.push({ ...incoming });
    }
  });
  return merged;
};

const saveProfileToServer = (patch) => {
  if (!patch || typeof patch !== "object") return;
  fetch("/api/profile", {
    method: "PUT",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }).catch(() => {});
};

const clearLocalAccountData = (account) => {
  if (typeof window === "undefined") return;
  const emailKey = String(account?.email || "").trim().toLowerCase();
  if (!emailKey) return;
  ["meal05_cart", "mealkit_orders", "meal05_notifications"].forEach((prefix) => {
    try {
      window.localStorage.removeItem(`${prefix}_${emailKey}`);
    } catch {
      /* ignore local cleanup failures */
    }
  });
};

export function AccountPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [user, setUser] = useState(null);
  const [hydrated, setHydrated] = useState(false);
  const [orders, setOrders] = useState([]);
  const [ordersStatus, setOrdersStatus] = useState("idle");
  const [ordersMessage, setOrdersMessage] = useState("");
  const [savedCart, setSavedCart] = useState([]);
  const [favoriteProductIds, setFavoriteProductIds] = useState([]);
  const [favoritesStatus, setFavoritesStatus] = useState("idle");
  const [cartMessage, setCartMessage] = useState("");
  const [walletSnapshot, setWalletSnapshot] = useState(null);
  const [walletTransactions, setWalletTransactions] = useState([]);
  const [walletStatus, setWalletStatus] = useState("idle");
  const [walletMessage, setWalletMessage] = useState("");
  const [walletTopupAmount, setWalletTopupAmount] = useState("");
  const [walletTopupProvider, setWalletTopupProvider] = useState("moniepoint_transfer");
  const [walletTopupTransfer, setWalletTopupTransfer] = useState(null);
  const [walletPayerAccountName, setWalletPayerAccountName] = useState("");
  const [walletPayerBankName, setWalletPayerBankName] = useState("");
  const [walletTransferReference, setWalletTransferReference] = useState("");
  const [walletExactAmountConfirmed, setWalletExactAmountConfirmed] = useState(false);
  const [walletTransferStatus, setWalletTransferStatus] = useState("idle");
  const [phoneCountry, setPhoneCountry] = useState(DEFAULT_PHONE_COUNTRY_CODE);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneFeedback, setPhoneFeedback] = useState("");
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const phoneFeedbackTimeoutRef = useRef(null);
  const profileLoadedRef = useRef(false);
  const [addressValue, setAddressValue] = useState("");
  const [addressFeedback, setAddressFeedback] = useState("");
  const [addressFormLabel, setAddressFormLabel] = useState("Home");
  const [addressFormLine, setAddressFormLine] = useState("");
  const [addressFormMessage, setAddressFormMessage] = useState("");
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const addressFeedbackTimeoutRef = useRef(null);
  const addressFormMessageTimeoutRef = useRef(null);
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [trackingOrderId, setTrackingOrderId] = useState(null);
  const [deliveryContacts, setDeliveryContacts] = useState({});
  const deliveryContactRequestsRef = useRef(new Set());
  const { ordered: homeProducts } = useCatalogProducts("/api/catalog/home?limit=12");
  const [recentProductIds, setRecentProductIds] = useState([]);
  const [quickAddProduct, setQuickAddProduct] = useState(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddAnchorRect, setQuickAddAnchorRect] = useState(null);
  const [quickAddAnchorEl, setQuickAddAnchorEl] = useState(null);
  const [deleteAccountStatus, setDeleteAccountStatus] = useState("idle");
  const [deleteAccountMessage, setDeleteAccountMessage] = useState("");
  const orderProductIds = useMemo(() => {
    const ids = [];
    orders.forEach((order) => {
      (Array.isArray(order?.items) ? order.items : []).forEach((item) => {
        const id = item?.productId ?? item?.product_id ?? item?.product?.id ?? item?.id;
        if (id != null) ids.push(String(id));
      });
    });
    return ids;
  }, [orders]);
  const lookupProductIds = useMemo(
    () => [...favoriteProductIds, ...recentProductIds, ...orderProductIds],
    [favoriteProductIds, recentProductIds, orderProductIds]
  );
  const { index: productIndex } = useProductsByIds(lookupProductIds);

  const addressBook = useMemo(() => (Array.isArray(user?.addresses) ? user.addresses : []), [user]);
  const defaultAddress = useMemo(() => {
    if (!addressBook.length) return null;
    return addressBook.find((addr) => addr.id === user?.defaultAddressId) || addressBook[0];
  }, [addressBook, user]);

  const activeTab = useMemo(() => {
    const routeTab = getRouteTab(pathname);
    if (routeTab) return routeTab;
    const slug = searchParams?.get("tab");
    return getCurrentTab(slug);
  }, [pathname, searchParams]);
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
    if (pathname !== "/account") return;
    const legacyTab = searchParams?.get("tab");
    if (!legacyTab) return;
    const route = LEGACY_TAB_TO_ACCOUNT_ROUTE[legacyTab] ?? legacyTab;
    const params = new URLSearchParams(searchParams?.toString() || "");
    params.delete("tab");
    const query = params.toString();
    router.replace(`${route ? `/account/${route}` : "/account"}${query ? `?${query}` : ""}`, { scroll: false });
  }, [pathname, router, searchParams]);

  const syncOrdersFromServer = useCallback(
    async () => {
      if (!user) return;
      setOrdersStatus("loading");
      setOrdersMessage("");
      try {
        const supabase = getBrowserSupabaseClient();
        const { data: { session } } = await supabase.auth.getSession();
        const accessToken = String(session?.access_token || "").trim();
        const response = await fetch("/api/orders", {
          cache: "no-store",
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || "Unable to load your orders.");
        }
        const apiOrders = Array.isArray(payload?.orders) ? payload.orders.map(mapApiOrder).filter((order) => order.orderId) : [];
        setUserOrders(apiOrders, user);
        setOrders(apiOrders);
        setOrdersStatus("ready");
      } catch (error) {
        // Keep any local order snapshot, but do not present a failed server
        // request as a genuine empty order history.
        setOrdersStatus("error");
        setOrdersMessage(error?.message || "Unable to load your orders.");
      }
    },
    [user]
  );

  const syncWalletFromServer = useCallback(async ({ showFeedback = false } = {}) => {
    if (!user) return;
    setWalletStatus("loading");
    if (showFeedback) setWalletMessage("");
    try {
      const [walletResponse, transactionsResponse] = await Promise.all([
        fetch("/api/wallet", { cache: "no-store" }),
        fetch("/api/wallet/transactions", { cache: "no-store" }),
      ]);
      const walletPayload = await walletResponse.json().catch(() => ({}));
      const transactionsPayload = await transactionsResponse.json().catch(() => ({}));
      if (!walletResponse.ok) {
        setWalletMessage(walletPayload?.error || "Unable to load Meal05 Balance.");
        setWalletStatus("error");
        return;
      }
      if (!transactionsResponse.ok) {
        setWalletMessage(transactionsPayload?.error || "Unable to load wallet transactions.");
        setWalletStatus("error");
        return;
      }
      setWalletSnapshot(walletPayload);
      setWalletTransactions(Array.isArray(transactionsPayload?.transactions) ? transactionsPayload.transactions : []);
      setWalletStatus("ready");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("meal05:wallet-refresh", { detail: walletPayload }));
      }
      if (showFeedback) setWalletMessage("Meal05 Balance refreshed.");
    } catch {
      setWalletMessage("Unable to load Meal05 Balance.");
      setWalletStatus("error");
    }
  }, [user]);

  const handleWalletTopup = useCallback(async (event) => {
    event?.preventDefault?.();
    setWalletStatus("loading");
    setWalletMessage("");
    try {
      const response = await fetch("/api/wallet/topups", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: walletTopupAmount,
          provider: walletTopupProvider,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setWalletMessage(payload?.error || "Unable to start top-up.");
        setWalletStatus("error");
        return;
      }
      if (payload?.authorizationUrl) {
        window.location.href = payload.authorizationUrl;
        return;
      }
      setWalletTopupTransfer(payload);
      setWalletPayerAccountName(formatName(user));
      setWalletPayerBankName("");
      setWalletTransferReference("");
      setWalletExactAmountConfirmed(false);
      setWalletMessage("");
      await syncWalletFromServer();
    } catch {
      setWalletMessage("Unable to start top-up.");
      setWalletStatus("error");
    }
  }, [syncWalletFromServer, user, walletTopupAmount, walletTopupProvider]);

  const copyWalletText = useCallback((value) => {
    if (typeof navigator === "undefined" || !navigator.clipboard || !value) return;
    navigator.clipboard.writeText(String(value)).catch(() => {});
  }, []);

  const handleWalletTransferSubmit = useCallback(async () => {
    const topupId = String(walletTopupTransfer?.topupId || "").trim();
    const paymentId = walletTopupTransfer?.payment?.id;
    if (!topupId || !paymentId) return;
    if (walletPayerAccountName.trim().length < 2) {
      setWalletMessage("Enter the name on the account you transferred from.");
      setWalletStatus("error");
      return;
    }
    if (walletPayerBankName.trim().length < 2) {
      setWalletMessage("Enter the bank or wallet you transferred from.");
      setWalletStatus("error");
      return;
    }
    if (!walletExactAmountConfirmed) {
      setWalletMessage("Confirm that you transferred the exact amount.");
      setWalletStatus("error");
      return;
    }

    setWalletTransferStatus("loading");
    setWalletMessage("");
    try {
      const response = await fetch(`/api/wallet/topups/${encodeURIComponent(topupId)}/submit`, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentId,
          payerAccountName: walletPayerAccountName.trim(),
          payerBankName: walletPayerBankName.trim(),
          customerTransactionReference: walletTransferReference.trim(),
          exactAmountConfirmed: walletExactAmountConfirmed,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Unable to submit wallet deposit.");

      setWalletTopupTransfer(null);
      setWalletTopupAmount("");
      setWalletPayerAccountName("");
      setWalletPayerBankName("");
      setWalletTransferReference("");
      setWalletExactAmountConfirmed(false);
      setWalletMessage(payload?.message || "Wallet deposit submitted for verification.");
      setWalletStatus("ready");
      await syncWalletFromServer();
    } catch (error) {
      setWalletMessage(error?.message || "Unable to submit wallet deposit.");
      setWalletStatus("error");
    } finally {
      setWalletTransferStatus("idle");
    }
  }, [syncWalletFromServer, walletExactAmountConfirmed, walletPayerAccountName, walletPayerBankName, walletTopupTransfer, walletTransferReference]);

  useEffect(() => {
    let cancelled = false;
    const loadAuthenticatedUser = async () => {
      const stored = ensureUserAddressBook(readStoredUser());
      try {
        const supabase = getBrowserSupabaseClient();
        const { data: { user: authUser }, error } = await supabase.auth.getUser();
        if (error || !authUser) {
          if (cancelled) return;
          clearStoredUser();
          setUser(null);
          setOrders([]);
          setSavedCart([]);
          router.replace(signInRedirectHref);
          return;
        }
        if (cancelled) return;
        const verified = ensureUserAddressBook(deriveStoredUserFromAuthUser(authUser, stored || {}));
        setUser(verified);
        setOrders(readUserOrders(verified));
        setSavedCart(readCartItems(verified));
        persistStoredUser(verified);
        setHydrated(true);
      } catch {
        if (cancelled) return;
        if (!stored) {
          clearStoredUser();
          setUser(null);
          setOrders([]);
          setSavedCart([]);
          router.replace(signInRedirectHref);
          return;
        }
        setUser(stored);
        setOrders(readUserOrders(stored));
        setSavedCart(readCartItems(stored));
        setHydrated(true);
      }
    };

    loadAuthenticatedUser();
    return () => {
      cancelled = true;
    };
  }, [router, signInRedirectHref]);

  useEffect(() => {
    if (!hydrated || !user) return;
    syncOrdersFromServer();
  }, [hydrated, syncOrdersFromServer, user]);

  useEffect(() => {
    if (!hydrated || !user) {
      setFavoriteProductIds([]);
      setFavoritesStatus("idle");
      return undefined;
    }
    const controller = new AbortController();
    setFavoritesStatus("loading");
    loadFavoriteIds()
      .then((ids) => {
        if (controller.signal.aborted) return;
        setFavoriteProductIds(ids);
        setFavoritesStatus("ready");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setFavoritesStatus("error");
      });
    return () => controller.abort();
  }, [hydrated, user]);

  useEffect(() => {
    const handleFavoritesUpdated = (event) => {
      const ids = Array.isArray(event?.detail?.productIds) ? event.detail.productIds.map(String) : [];
      setFavoriteProductIds(ids);
      setFavoritesStatus("ready");
    };
    window.addEventListener(FAVORITES_UPDATED_EVENT, handleFavoritesUpdated);
    return () => window.removeEventListener(FAVORITES_UPDATED_EVENT, handleFavoritesUpdated);
  }, []);

  useEffect(() => {
    if (!hydrated || !user || !["overview", "balance"].includes(activeTab)) return;
    syncWalletFromServer({ showFeedback: searchParams?.get("wallet") === "success" });
  }, [activeTab, hydrated, searchParams, syncWalletFromServer, user]);

  useEffect(() => {
    if (!hydrated || !user) return;
    if (profileLoadedRef.current) return;
    profileLoadedRef.current = true;
    let cancelled = false;
    fetch("/api/profile", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (cancelled || !payload?.profile) return;
        const profile = payload.profile;
        const merged = ensureUserAddressBook({
          ...user,
          fullName:
            [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() ||
            profile.name ||
            user.fullName,
          phone: profile.phone ?? user.phone,
          address: profile.address ?? user.address,
        });
        setUser(merged);
        persistStoredUser(merged);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [hydrated, user]);

  useEffect(() => {
    const handleAuthChange = (event) => {
      const nextUser = ensureUserAddressBook(event?.detail?.user ?? readStoredUser());
      if (!nextUser) {
        profileLoadedRef.current = false;
        setUser(null);
        setOrders([]);
        setSavedCart([]);
        router.replace(signInRedirectHref);
        return;
      }
      profileLoadedRef.current = false;
      setUser(nextUser);
      setOrders(readUserOrders(nextUser));
      setSavedCart(readCartItems(nextUser));
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

  useEffect(() => {
    const handleCartChange = () => {
      setSavedCart(readCartItems());
    };
    handleCartChange();
    window.addEventListener(CART_UPDATED_EVENT, handleCartChange);
    return () => {
      window.removeEventListener(CART_UPDATED_EVENT, handleCartChange);
    };
  }, []);

  const handleLogout = () => {
    clearStoredUser();
    profileLoadedRef.current = false;
    setUser(null);
    setOrders([]);
    setSavedCart([]);
    router.replace(signInRedirectHref);
  };

  const handleDeleteAccount = useCallback(async () => {
    if (!user || deleteAccountStatus === "loading") return;
    const confirmed = window.confirm(
      "Delete your Meal05 account? This removes your saved data and closes sign-in access. Active orders or a non-zero Meal05 Balance must be resolved first."
    );
    if (!confirmed) return;

    setDeleteAccountStatus("loading");
    setDeleteAccountMessage("");
    try {
      const response = await fetch("/api/account/delete", {
        method: "DELETE",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "DELETE" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setDeleteAccountStatus("error");
        setDeleteAccountMessage(payload?.error || "Unable to delete account right now.");
        return;
      }

      clearLocalAccountData(user);
      clearStoredUser();
      profileLoadedRef.current = false;
      setUser(null);
      setOrders([]);
      setSavedCart([]);
      try {
        await getBrowserSupabaseClient().auth.signOut({ scope: "global" });
      } catch {
        /* Local auth state has already been cleared. */
      }
      router.replace("/");
    } catch {
      setDeleteAccountStatus("error");
      setDeleteAccountMessage("Unable to delete account right now.");
    }
  }, [deleteAccountStatus, router, user]);

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
      setRecentProductIds([]);
      return;
    }
    setRecentProductIds(history.filter((id, index) => history.indexOf(id) === index).slice(0, 8));
  }, []);

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
    const phoneRaw = phoneNumber.trim();
    const digitsOnly = phoneRaw.replace(/\D/g, "");
    const existingPhone = (user.phone || "").trim();
    if (phoneRaw && (!PHONE_INPUT_REGEX.test(phoneRaw) || !PHONE_NUMBER_REGEX.test(digitsOnly))) {
      setPhoneFeedback("Enter a valid phone number using 4 to 14 digits after the country code.");
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
    saveProfileToServer({ phone: nextValue });
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
    saveProfileToServer({ address: trimmedAddress });
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
    saveProfileToServer({ address: nextUser.address || "" });
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
    saveProfileToServer({ address: nextUser.address || "" });
    setAddressValue(nextUser.address || "");
    setAddressFeedback("Address removed");
    scheduleAddressFeedbackClear();
  };

  const handleSetDefaultAddress = (id) => {
    if (!user) return;
    const nextUser = ensureUserAddressBook({ ...user, defaultAddressId: id });
    setUser(nextUser);
    persistStoredUser(nextUser);
    saveProfileToServer({ address: nextUser.address || "" });
    setAddressValue(nextUser.address || "");
    setAddressFeedback("Default address updated");
    scheduleAddressFeedbackClear();
  };

  const visibleOrders = orders;
  const presentOrders = useMemo(
    () => visibleOrders.filter((order) => !["delivered", "completed"].includes(String(order.status || "").toLowerCase())),
    [visibleOrders]
  );
  const pastOrders = useMemo(
    () => visibleOrders.filter((order) => ["delivered", "completed"].includes(String(order.status || "").toLowerCase())),
    [visibleOrders]
  );
  const recentlyViewed = useMemo(
    () => recentProductIds.map((id) => productIndex.get(String(id))).filter(Boolean),
    [productIndex, recentProductIds]
  );
  const favoriteProducts = useMemo(
    () => favoriteProductIds.map((id) => productIndex.get(String(id))).filter(Boolean),
    [favoriteProductIds, productIndex]
  );
  const userInitials = useMemo(() => {
    const words = formatName(resolvedUser).split(/\s+/).filter(Boolean);
    return `${words[0]?.[0] || "M"}${words[1]?.[0] || words[0]?.[1] || "F"}`.toUpperCase();
  }, [resolvedUser]);
  const getTabBadge = (slug) => {
    if (slug === "orders") return presentOrders.length || pastOrders.length || "";
    if (slug === "favorites") return favoriteProductIds.length || "";
    if (slug === "voucher") return 2;
    return "";
  };

  const loadDeliveryContact = useCallback(
    async (orderId) => {
      if (!user || !orderId) return;
      const key = String(orderId);
      if (deliveryContactRequestsRef.current.has(key) || deliveryContacts[key]?.status === "ready") return;
      deliveryContactRequestsRef.current.add(key);
      setDeliveryContacts((current) => ({ ...current, [key]: { status: "loading", available: false } }));
      try {
        const response = await fetch(`/api/orders/${encodeURIComponent(key)}/delivery-contact`, { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        setDeliveryContacts((current) => ({
          ...current,
          [key]: response.ok ? { status: "ready", ...payload } : { status: "error", available: false },
        }));
      } catch {
        setDeliveryContacts((current) => ({ ...current, [key]: { status: "error", available: false } }));
      } finally {
        deliveryContactRequestsRef.current.delete(key);
      }
    },
    [deliveryContacts, user]
  );

  useEffect(() => {
    if (activeTab !== "orders" || !expandedOrderId) return;
    const expandedOrder = presentOrders.find((order) => order.orderId === expandedOrderId);
    if (!expandedOrder) return;
    void loadDeliveryContact(expandedOrder.orderId);
  }, [activeTab, expandedOrderId, loadDeliveryContact, presentOrders]);

  const handleReorder = async (order) => {
    const orderItems = Array.isArray(order?.items) ? order.items : [];
    const incoming = orderItems
      .map((item) => buildCartItemFromOrderItem(item, productIndex))
      .filter(Boolean);

    if (!incoming.length) {
      setCartMessage("This order does not have reorderable items.");
      return;
    }

    try {
      let nextCart;
      if (readStoredUser()) {
        for (const item of incoming) {
          nextCart = await addAuthenticatedCartItem(
            { ...item, quantity: normaliseOrderQuantity(item.quantity) },
            { source: "account-reorder" }
          );
        }
      } else {
        nextCart = mergeCartItems(readCartItems(), incoming);
        writeCartItems(nextCart, undefined, { source: "account-reorder" });
      }
      setSavedCart(Array.isArray(nextCart) ? nextCart : readCartItems());
      setCartMessage(`${incoming.length} item${incoming.length === 1 ? "" : "s"} added back to your cart.`);
    } catch (error) {
      setCartMessage(error?.message || "Unable to add this order back to your cart.");
      return;
    }

    const params = new URLSearchParams(searchParams?.toString() || "");
    params.set("tab", "cart");
    router.replace(`/account?${params.toString()}`, { scroll: false });
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
    const personalRows = [
      {
        slug: "addresses",
        label: "Saved addresses",
        body: addressBook.length ? `${addressBook.length} saved delivery ${addressBook.length === 1 ? "address" : "addresses"}` : "Set your default delivery address",
        icon: IconMapPin,
      },
      {
        slug: "orders",
        label: "Order history",
        body: orders.length ? `${orders.length} order${orders.length === 1 ? "" : "s"} on this account` : "Track current and past orders",
        icon: IconPackage,
      },
      {
        slug: "availability-requests",
        href: "/account/availability-requests",
        label: "Availability requests",
        body: "Track baskets awaiting confirmation before payment",
        icon: IconClock,
      },
      {
        slug: "balance",
        label: "Wallet",
        body: `Balance: ${formatMoney(walletSnapshot?.balance || 0, walletSnapshot?.currencyCode || "NGN")}`,
        icon: IconWallet,
      },
      {
        slug: "refunds",
        label: "Refunds",
        body: "Review refund requests and wallet reversals",
        icon: IconReceiptRefund,
      },
      {
        slug: "referrals",
        label: "Refer & Earn",
        body: "Invite friends and track referral rewards",
        icon: IconUsersPlus,
      },
    ];
    const appRows = [
      {
        slug: "faqs",
        label: "FAQs",
        body: "Answers to common Meal05 questions",
        icon: IconHelpCircle,
      },
      {
        slug: "help",
        label: "Help & support",
        body: "Get support for orders, delivery and refunds",
        icon: IconMessageCircle,
      },
      {
        slug: "notifications",
        label: "Notification settings",
        body: "Choose the alerts you want from Meal05",
        icon: IconBell,
      },
      {
        slug: "legal",
        label: "Legal & System",
        body: "Policies, terms and app information",
        icon: IconFileDescription,
      },
    ];
    const renderMenuGroup = (title, rows) => (
      <section className={styles.accountMenuGroup} aria-labelledby={`account-${title.toLowerCase().replace(/\s+/g, "-")}`}>
        <h2 id={`account-${title.toLowerCase().replace(/\s+/g, "-")}`} className={styles.accountMenuTitle}>
          {title}
        </h2>
        <div className={styles.accountMenuList}>
          {rows.map((row) => {
            const badge = getTabBadge(row.slug);
            const RowIcon = row.icon || IconShoppingBag;
            return (
              <Link key={row.slug} href={row.href || getAccountRoute(row.slug)} className={styles.accountMenuRow}>
                <span className={styles.accountMenuIcon}>
                  <RowIcon size={19} stroke={1.9} aria-hidden="true" />
                </span>
                <span className={styles.accountMenuBody}>
                  <strong>{row.label}</strong>
                  <span>{row.body}</span>
                </span>
                {badge ? <em>{badge}</em> : null}
                <i className={`fa-solid fa-chevron-right ${styles.accountMenuChevron}`} aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      </section>
    );

    return (
      <div className={styles.accountHub}>
        <section className={styles.accountProfilePanel}>
          <span className={styles.accountAvatar}>{userInitials}</span>
          <span className={styles.accountProfileCopy}>
            <strong>{formatName(resolvedUser)}</strong>
            <span>{formatPhoneDisplay(resolvedUser.phone)}</span>
            <span>{resolvedUser.email}</span>
          </span>
          <Link href={getAccountRoute("management")} className={styles.accountEditLink}>
            Edit
          </Link>
        </section>
        {renderMenuGroup("Personal", personalRows)}
        {renderMenuGroup("App", appRows)}
        <button type="button" className={styles.accountLogoutRow} onClick={handleLogout}>
          <span className={styles.accountMenuIcon}>
            <IconLogout size={19} stroke={1.9} aria-hidden="true" />
          </span>
          <span className={styles.accountMenuBody}>
            <strong>Log out</strong>
            <span>Sign out of this Meal05 account</span>
          </span>
          <i className={`fa-solid fa-chevron-right ${styles.accountMenuChevron}`} aria-hidden="true" />
        </button>
      </div>
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
            {ordersStatus === "error" ? (
              <div className={styles.sectionEmpty} role="alert">
                <p>{ordersMessage || "Unable to load your orders."}</p>
                <button type="button" className={styles.orderActionButton} onClick={syncOrdersFromServer}>
                  Try again
                </button>
              </div>
            ) : null}
            <div className={styles.section}>
              <div className={styles.sectionHeader} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h3 className={styles.sectionTitle}>Current orders</h3>
              </div>
              {presentOrders.length ? (
                <div className={styles.list}>
                  {presentOrders.map((order) => (
                    <div className={`${styles.listItem} ${styles.orderListItem}`} key={order.orderId}>
                      <div className={styles.orderInfo}>
                        <strong>Order {order.orderId}</strong>
                        <span>Placed {formatOrderDate(order.placedAt)}</span>
                        <span>Total {formatProductPrice(order.summary?.total || 0)}</span>
                        <span>{order.items.length} item{order.items.length === 1 ? "" : "s"}</span>
                        <span>Status: {formatStatusLabel(order.status)}</span>
                        <span>Payment: {formatStatusLabel(order.paymentStatus)}</span>
                        {order.latestPayment?.status === "rejected" ? (
                          <span>
                            Transfer could not be confirmed
                            {order.latestPayment.rejection_reason ? `: ${order.latestPayment.rejection_reason}` : "."}
                          </span>
                        ) : null}
                        {order.latestPayment?.status === "expired" ? <span>Payment request expired.</span> : null}
                      </div>
                      <div className={styles.orderActions}>
                        <button
                          type="button"
                          className={styles.orderActionButton}
                          aria-expanded={expandedOrderId === order.orderId}
                          onClick={() => {
                            const isOpen = expandedOrderId === order.orderId;
                            setExpandedOrderId(isOpen ? null : order.orderId);
                            if (isOpen) setTrackingOrderId(null);
                          }}
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
                      </div>
                      {expandedOrderId === order.orderId ? (
                        <div className={styles.orderDetailsPanel}>
                          <div className={styles.orderReferenceRow}>
                            <span>Order reference</span>
                            <strong>{order.orderReference}</strong>
                          </div>
                          <OrderItemsList items={order.items} />
                          <button
                            type="button"
                            className={styles.orderActionButton}
                            onClick={() => setTrackingOrderId(trackingOrderId === order.orderId ? null : order.orderId)}
                          >
                            {trackingOrderId === order.orderId ? "Hide tracking" : "Track order"}
                          </button>
                          {trackingOrderId === order.orderId ? <OrderTracker order={order} /> : null}
                          {String(order.paymentStatus || "").toLowerCase() === "awaiting_payment"
                            && String(order.paymentMethod || "").toLowerCase() === "moniepoint_transfer"
                            && !order.availabilityRequestId ? (
                            <Link
                              className={styles.orderActionButton}
                              href={`/checkout/payment/moniepoint_transfer?orderId=${encodeURIComponent(order.orderId)}`}
                            >
                              {order.latestPayment?.status === "rejected" || order.latestPayment?.status === "expired"
                                ? "Retry transfer"
                                : "Complete payment"}
                            </Link>
                          ) : null}
                          <DeliveryContactCard contactState={deliveryContacts[order.orderId]} />
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : ordersStatus === "loading" ? (
                <div className={styles.sectionEmpty} role="status" aria-live="polite">
                  <i className="fa-solid fa-box" aria-hidden="true" style={{ fontSize: "1.4rem" }} />
                  <p>Loading your orders...</p>
                </div>
              ) : ordersStatus === "error" ? null : (
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
                    <div className={`${styles.listItem} ${styles.orderListItem}`} key={order.orderId}>
                      <div className={styles.orderInfo}>
                        <strong>Order {order.orderId}</strong>
                        <span>Delivered {formatOrderDate(order.placedAt)}</span>
                        <span>Total {formatProductPrice(order.summary?.total || 0)}</span>
                        <span>{order.items.length} item{order.items.length === 1 ? "" : "s"}</span>
                        {expandedOrderId === order.orderId ? (
                          <div className={styles.orderDetailsPanel}>
                            <div className={styles.orderReferenceRow}>
                              <span>Order reference</span>
                              <strong>{order.orderReference}</strong>
                            </div>
                            <OrderItemsList items={order.items} />
                            <button
                              type="button"
                              className={styles.orderActionButton}
                              onClick={() => setTrackingOrderId(trackingOrderId === order.orderId ? null : order.orderId)}
                            >
                              {trackingOrderId === order.orderId ? "Hide tracking" : "Track order"}
                            </button>
                          {trackingOrderId === order.orderId ? <OrderTracker order={order} /> : null}
                          </div>
                        ) : null}
                      </div>
                      <div className={styles.orderActions}>
                        <button
                          type="button"
                          className={styles.orderActionButton}
                          aria-expanded={expandedOrderId === order.orderId}
                          onClick={() => {
                            const isOpen = expandedOrderId === order.orderId;
                            setExpandedOrderId(isOpen ? null : order.orderId);
                            if (isOpen) setTrackingOrderId(null);
                          }}
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
                        <button type="button" className={styles.orderActionButton} onClick={() => handleReorder(order)}>
                          Buy again
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.sectionEmpty}>
                  <i className="fa-regular fa-calendar" aria-hidden="true" style={{ fontSize: "1.4rem" }} />
                  <p>No completed orders yet. Once delivery is completed it will appear here.</p>
                </div>
              )}
            </div>
          </>
        );
      case "cart": {
        const cartTotal = savedCart.reduce((sum, item) => {
          const count = normaliseOrderQuantity(item.orderCount ?? item.quantity);
          return sum + (Number(item.price) || 0) * count;
        }, 0);
        return (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h3 className={styles.sectionTitle}>Saved cart</h3>
                <p className={styles.cardBody}>
                  Items saved in your cart are kept here so you can continue checkout or rebuild an order quickly.
                </p>
              </div>
              <span className={styles.addressBadge}>{savedCart.length} item{savedCart.length === 1 ? "" : "s"}</span>
            </div>

            {cartMessage ? (
              <span className={styles.profileMessage} role="status" aria-live="polite">
                {cartMessage}
              </span>
            ) : null}

            {savedCart.length ? (
              <>
                <div className={styles.list}>
                  {savedCart.map((item, index) => {
                    const quantity = normaliseOrderQuantity(item.orderCount ?? item.quantity);
                    const lineTotal = (Number(item.price) || 0) * quantity;
                    return (
                      <div className={styles.listItem} key={`${item.variantId || item.id || item.productId || index}`}>
                        <div className={styles.orderInfo}>
                          <strong>{item.name || item.productName || `Cart item ${index + 1}`}</strong>
                          <span>
                            {item.variantName ? `${item.variantName} - ` : ""}
                            Qty {quantity}
                            {item.unit ? ` - ${item.unit}` : ""}
                          </span>
                        </div>
                        <div className={styles.listItemValue}>
                          <span>{formatProductPrice(lineTotal)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className={styles.twoColumn}>
                  <div className={styles.card}>
                    <h3 className={styles.cardTitle}>Cart total</h3>
                    <p className={styles.cardBody}>{formatProductPrice(cartTotal)}</p>
                    <Link href="/cart" className={styles.cardAction}>
                      Review cart
                    </Link>
                  </div>
                  <div className={styles.card}>
                    <h3 className={styles.cardTitle}>Ready to checkout</h3>
                    <p className={styles.cardBody}>Your default address will be available during checkout.</p>
                    <Link href="/checkout" className={styles.cardAction}>
                      Continue checkout
                    </Link>
                  </div>
                </div>
              </>
            ) : (
              <div className={styles.sectionEmpty}>
                <i className="fa-solid fa-cart-shopping" aria-hidden="true" style={{ fontSize: "1.6rem" }} />
                <p>Your saved cart is empty. Buy a past order again or add fresh items from the catalogue.</p>
                <Link href="/shop">Browse catalogue</Link>
              </div>
            )}
          </div>
        );
      }
      case "balance": {
        const settings = walletSnapshot?.settings || {};
        const balance = Number(walletSnapshot?.balance || 0);
        const currencyCode = walletSnapshot?.currencyCode || "NGN";
        const pendingTopups = Array.isArray(walletSnapshot?.pendingTopups) ? walletSnapshot.pendingTopups : [];
        const walletEnabled = settings.walletEnabled === true;
        const moniepointEnabled = settings.monnifyTopupsEnabled === true;
        const activeTopupPayment = walletTopupTransfer?.payment || null;
        const activeTopupProvider = walletTopupTransfer?.provider || null;
        return (
          <>
            <div className={[styles.creditBanner, styles.walletBalanceCard].join(" ")}>
              <div className={styles.walletBalanceCopy}>
                <span>Current balance</span>
                <strong>{formatMoney(balance, currencyCode)}</strong>
              </div>
              <span className={walletEnabled ? styles.walletStatusReady : styles.walletStatusPending}>
                {walletEnabled ? <IconCircleCheck size={17} stroke={2.2} aria-hidden="true" /> : <IconClock size={17} stroke={2.2} aria-hidden="true" />}
                {walletEnabled ? "Available" : "Coming soon"}
              </span>
            </div>
            <div className={[styles.section, styles.walletTopupSection].join(" ")}>
              <div className={styles.walletSectionHeader}>
                <h3 className={styles.sectionTitle}>Add money</h3>
              </div>
              <p className={styles.profileHint}>
                {walletSnapshot?.disclosure || "Meal05 Balance can only be used for purchases on Meal05. It is not a bank account and does not earn interest."}
              </p>
              {!walletEnabled ? (
                <span className={styles.walletAvailabilityNote}>Meal05 Balance is being prepared and will be available to customers soon.</span>
              ) : null}
              <form className={styles.walletTopupForm} onSubmit={handleWalletTopup}>
                <div className={styles.walletQuickAmounts}>
                  {[2000, 5000, 10000].map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      className={walletTopupAmount === String(amount) ? styles.walletQuickAmountActive : undefined}
                      onClick={() => setWalletTopupAmount(String(amount))}
                      aria-pressed={walletTopupAmount === String(amount)}
                    >
                      {formatMoney(amount)}
                    </button>
                  ))}
                </div>
                <label className={styles.profileField}>
                  <span>Custom amount</span>
                   <input
                     inputMode="numeric"
                    min={settings.minimumTopupAmount || undefined}
                    max={settings.maximumTopupAmount || undefined}
                    name="walletTopupAmount"
                     onChange={(event) => setWalletTopupAmount(event.target.value.replace(/\D/g, ""))}
                     placeholder="Enter amount (e.g. 10000)"
                     type="text"
                     pattern="[0-9]*"
                    value={walletTopupAmount}
                  />
                </label>
                <label className={styles.profileField}>
                  <span>Funding method</span>
                  <div className={styles.walletFundingControl}>
                    <span aria-hidden="true">M</span>
                    <select value={walletTopupProvider} onChange={(event) => setWalletTopupProvider(event.target.value)}>
                      <option value="moniepoint_transfer" disabled={!moniepointEnabled}>Moniepoint Transfer</option>
                      <option value="opay_transfer" disabled>OPay Transfer (Unavailable for now)</option>
                      <option value="paystack" disabled>Card, USSD and Paystack (Coming later)</option>
                    </select>
                  </div>
                </label>
                {settings.minimumTopupAmount || settings.maximumTopupAmount ? (
                  <p className={styles.walletLimits}>
                    <IconLock size={16} stroke={1.8} aria-hidden="true" />
                    <span>
                      Limits: {settings.minimumTopupAmount ? `Min ${formatMoney(settings.minimumTopupAmount)}` : ""}
                      {settings.minimumTopupAmount && settings.maximumTopupAmount ? " · " : ""}
                      {settings.maximumTopupAmount ? `Max ${formatMoney(settings.maximumTopupAmount)}` : ""}
                    </span>
                  </p>
                ) : null}
                {!activeTopupPayment || !activeTopupProvider ? (
                  <button type="submit" className={styles.walletTopupButton} disabled={walletStatus === "loading" || !walletEnabled}>
                    {walletStatus === "loading" ? "Please wait..." : "Add money"}
                  </button>
                ) : null}
               </form>
               {activeTopupPayment && activeTopupProvider ? (
                 <section className={styles.walletTransferPanel} aria-labelledby="wallet-transfer-heading">
                   <div className={styles.walletTransferHeader}>
                     <div className={styles.walletTransferTitle}>
                       <IconShieldCheck size={24} stroke={2} aria-hidden="true" />
                       <div>
                         <span>Wallet deposit</span>
                         <h4 id="wallet-transfer-heading">{walletTopupTransfer?.heading || "Complete your wallet deposit"}</h4>
                       </div>
                     </div>
                     <div className={styles.walletTransferAmount}>
                       <span>Deposit amount</span>
                       <strong>{formatMoney(activeTopupPayment.amount, activeTopupPayment.currency || "NGN")}</strong>
                     </div>
                   </div>
                   <p className={styles.walletTransferNotice}>
                     Transfer the exact amount to the account below. Your balance is credited only after Meal05 verifies the payment.
                   </p>
                   <dl className={styles.walletTransferDetails}>
                     {[
                       ["Bank", activeTopupProvider.bankName],
                       ["Account name", activeTopupProvider.accountName],
                       ["Account number", activeTopupProvider.accountNumber],
                       ["Payment reference", activeTopupPayment.reference],
                     ].map(([label, value]) => (
                       <div key={label}>
                         <dt>{label}</dt>
                         <dd>
                           <span>{value || "Unavailable"}</span>
                           {value ? (
                             <button type="button" onClick={() => copyWalletText(value)} aria-label={`Copy ${label.toLowerCase()}`}>
                               <IconCopy size={18} stroke={1.9} aria-hidden="true" />
                             </button>
                           ) : null}
                         </dd>
                       </div>
                     ))}
                   </dl>
                   <label className={styles.profileField}>
                     <span>Name on the account you transferred from</span>
                     <input
                       type="text"
                       minLength={2}
                       maxLength={120}
                       required
                       value={walletPayerAccountName}
                       onChange={(event) => setWalletPayerAccountName(event.target.value)}
                       autoComplete="name"
                     />
                   </label>
                   <label className={styles.profileField}>
                     <span>Bank you transferred from</span>
                     <input
                       type="text"
                       minLength={2}
                       maxLength={120}
                       required
                       value={walletPayerBankName}
                       onChange={(event) => setWalletPayerBankName(event.target.value)}
                       placeholder="e.g. GTBank or OPay"
                       autoComplete="organization"
                     />
                   </label>
                   <label className={styles.profileField}>
                     <span>Transaction reference (optional)</span>
                     <input
                       type="text"
                       maxLength={120}
                       value={walletTransferReference}
                       onChange={(event) => setWalletTransferReference(event.target.value)}
                       placeholder="Enter the reference from your bank receipt"
                     />
                     <small>This helps us locate your transfer faster.</small>
                   </label>
                   <label className={styles.walletExactConfirmation}>
                     <input
                       type="checkbox"
                       checked={walletExactAmountConfirmed}
                       onChange={(event) => setWalletExactAmountConfirmed(event.target.checked)}
                     />
                     <span>I transferred exactly {formatMoney(activeTopupPayment.amount, activeTopupPayment.currency || "NGN")}</span>
                   </label>
                   <div className={styles.walletTransferActions}>
                     <button type="button" onClick={() => setWalletTopupTransfer(null)} disabled={walletTransferStatus === "loading"}>
                       Cancel
                     </button>
                     <button type="button" onClick={handleWalletTransferSubmit} disabled={walletTransferStatus === "loading" || !walletExactAmountConfirmed}>
                       {walletTransferStatus === "loading" ? "Submitting..." : "I've sent the money"}
                     </button>
                   </div>
                 </section>
               ) : null}
               {walletMessage ? <span className={walletStatus === "error" ? styles.walletMessageError : styles.walletMessageSuccess}>{walletMessage}</span> : null}
            </div>
            {pendingTopups.length ? (
              <div className={[styles.section, styles.walletPendingSection].join(" ")}>
                <h3 className={styles.sectionTitle}>Pending top-ups</h3>
                <div className={styles.walletPendingList}>
                  {pendingTopups.map((topup) => (
                    <div key={topup.id} className={styles.walletPendingItem}>
                      <span className={styles.walletPendingIcon} aria-hidden="true">
                        <IconHourglass size={22} stroke={1.8} />
                      </span>
                      <div className={styles.walletPendingCopy}>
                        <h4>{formatWalletReason(topup.status)}</h4>
                        <p>{topup.provider} · {topup.merchant_reference}</p>
                      </div>
                      <strong className={styles.walletPendingAmount}>{formatMoney(topup.amount, topup.currency_code)}</strong>
                      {topup.authorization_url ? (
                        <a className={styles.walletPendingContinue} href={topup.authorization_url} aria-label={`Continue top-up ${topup.merchant_reference}`}>
                          <IconChevronRight size={20} stroke={2} aria-hidden="true" />
                        </a>
                      ) : (
                        <IconChevronRight className={styles.walletPendingChevron} size={20} stroke={2} aria-hidden="true" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div className={[styles.section, styles.walletTransactionsSection].join(" ")}>
              <div className={styles.walletHistoryHeader}>
                <h3 className={styles.sectionTitle}>Transaction history</h3>
                <button type="button" className={styles.orderActionButton} onClick={() => syncWalletFromServer({ showFeedback: true })}>
                  <IconRefresh size={16} stroke={2} aria-hidden="true" />
                  Refresh
                </button>
              </div>
              {walletTransactions.length ? (
                <div className={styles.walletTransactionList}>
                  {walletTransactions.map((entry) => {
                    const isCredit = Number(entry.amount) >= 0;
                    return (
                    <div key={entry.id} className={styles.walletTransactionItem}>
                      <span className={`${styles.walletTransactionIcon} ${isCredit ? styles.isCredit : styles.isDebit}`} aria-hidden="true">
                        <IconArrowDownLeft size={22} stroke={1.9} />
                      </span>
                      <div className={styles.walletTransactionCopy}>
                         <strong>{formatWalletTransactionLabel(entry)}</strong>
                         <span>{new Date(entry.created_at).toLocaleString("en-NG")}</span>
                         {entry.order_id ? <span>Meal05 Balance payment for order #{entry.order_id}</span> : null}
                         {entry.wallet_topup_id ? <span>Deposit ID: {entry.wallet_topup_id}</span> : null}
                         {entry.provider_reference ? <span>{entry.provider_reference}</span> : null}
                      </div>
                      <div className={`${styles.walletTransactionAmount} ${isCredit ? styles.isCredit : styles.isDebit}`}>
                        <strong>{formatMoney(entry.amount, entry.currency_code || "NGN")}</strong>
                        <span>Completed</span>
                      </div>
                    </div>
                    );
                  })}
                </div>
              ) : (
                <div className={styles.sectionEmpty}>
                  <i className="fa-solid fa-wallet" aria-hidden="true" style={{ fontSize: "1.8rem" }} />
                  <p>No Meal05 Balance transactions yet.</p>
                </div>
              )}
            </div>
          </>
        );
      }
      case "favorites":
        return favoritesStatus === "loading" ? (
          <div className={styles.section}>
            <div className={styles.sectionEmpty}>
              <p>Loading your Favorites...</p>
            </div>
          </div>
        ) : favoriteProducts.length ? (
          <>
          <div className={styles.productGrid}>
            {favoriteProducts.map((product) => (
              <ProductCard
                key={product.variantId || product.id}
                product={product}
                onQuickAdd={handleQuickAdd}
              />
            ))}
          </div>
          </>
        ) : renderEmptyState(
          "Favorites",
          favoritesStatus === "error"
            ? "We could not load your Favorites. Please refresh and try again."
            : "Save frequently bought items, such as rice, eggs, tomatoes, or chicken, for a quicker next order.",
          "/shop",
          "Browse catalogue"
        );
      case "voucher":
        return (
          <>
            <div className={styles.creditBanner}>
              <div>
                <span>Store credit balance</span>
                <strong>â‚¦0.00</strong>
              </div>
              <i className="fa-solid fa-wallet" aria-hidden="true" />
            </div>
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Available vouchers</h3>
              <div className={styles.voucherList}>
                <div className={styles.voucherItem}>
                  <strong>10% <span>OFF</span></strong>
                  <div>
                    <h4>Welcome discount</h4>
                    <p>Code <b>WELCOME10</b> - Expires 31 Jul</p>
                  </div>
                  <Link href="/cart">Apply</Link>
                </div>
                <div className={styles.voucherItem}>
                  <strong>{"\u20a6500"} <span>OFF</span></strong>
                  <div>
                    <h4>Free delivery credit</h4>
                    <p>Code <b>FRESH500</b> - Expires 15 Aug</p>
                  </div>
                  <Link href="/cart">Apply</Link>
                </div>
              </div>
            </div>
          </>
        );
      case "recent":
        return (
          <div className={styles.productGrid}>
            {(recentlyViewed.length ? recentlyViewed : homeProducts.slice(0, 3)).map((product) => {
              const price = Number(product.price ?? product.unit_price ?? product.unitPrice ?? 0);
              const cardProduct = {
                ...product,
                image: product.image || product.image_url || product.thumbnail,
                name: product.name || "Fresh produce",
                price,
              };

              return (
                <ProductCard
                  key={cardProduct.variantId || cardProduct.id}
                  product={cardProduct}
                  onQuickAdd={handleQuickAdd}
                />
              );
            })}
          </div>
        );
      case "management": {
        const addressDisplay = formatAddressDisplay(resolvedUser);
        return (
          <div className={`${styles.section} ${styles.managementSection}`}>
            <h3 className={styles.sectionTitle}>Account management</h3>
            <div className={styles.list}>
              <div className={styles.listItem}>
                <i className="fa-regular fa-user" aria-hidden="true" />
                <span>Full name</span>
                <span>{formatName(resolvedUser)}</span>
              </div>
              <div className={styles.listItem}>
                <i className="fa-regular fa-envelope" aria-hidden="true" />
                <span>Email</span>
                <span>{resolvedUser.email}</span>
              </div>
              <div className={styles.listItem}>
                <i className="fa-solid fa-phone" aria-hidden="true" />
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
                <i className="fa-solid fa-location-dot" aria-hidden="true" />
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
                <i className="fa-solid fa-lock" aria-hidden="true" />
                <span>Password</span>
                <Link href="/account/change-password">Change password</Link>
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
                        <option key={option.iso} value={option.code}>
                          {`${option.iso} ${option.code}`}
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
                        setPhoneNumber(event.target.value.slice(0, 24));
                        if (phoneFeedback) {
                          setPhoneFeedback("");
                        }
                      }}
                      placeholder="8120000000"
                      autoComplete="tel"
                      inputMode="numeric"
                      pattern={PHONE_INPUT_PATTERN}
                      minLength={4}
                      maxLength={24}
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
            <div className={styles.dangerZone}>
              <h3 className={styles.sectionTitle}>Delete account</h3>
              <p className={styles.cardBody}>
                Permanently close this account and remove saved cart, Favorites, addresses, payment methods, notifications, reviews, and profile data.
              </p>
              <button
                type="button"
                className={styles.dangerAction}
                onClick={handleDeleteAccount}
                disabled={deleteAccountStatus === "loading"}
              >
                {deleteAccountStatus === "loading" ? "Deleting..." : "Delete my account"}
              </button>
              {deleteAccountMessage ? (
                <span
                  className={styles.profileMessage}
                  role={deleteAccountStatus === "error" ? "alert" : "status"}
                  aria-live="polite"
                >
                  {deleteAccountMessage}
                </span>
              ) : null}
            </div>
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
                      <span className={styles.addressIcon}>
                        <i className={/office/i.test(addr.label || "") ? "fa-regular fa-building" : "fa-solid fa-house"} aria-hidden="true" />
                      </span>
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
                        <button
                          type="button"
                          className={styles.addressEdit}
                          onClick={() => (isDefault ? handleStartEditAddress() : handleSetDefaultAddress(addr.id))}
                          aria-label={`Edit ${addr.label || "saved address"}`}
                        >
                          <i className="fa-solid fa-pencil" aria-hidden="true" />
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
              <div className={styles.newsletterItem}>
                <i className="fa-solid fa-percent" aria-hidden="true" />
                <div>
                  <strong>Weekly offers & flash sales</strong>
                  <span>Deals, price drops and limited-time offers</span>
                </div>
                <button type="button" className={`${styles.toggle} ${styles.toggleOn}`} aria-pressed="true" aria-label="Weekly offers subscribed" />
              </div>
              <div className={styles.newsletterItem}>
                <i className="fa-solid fa-leaf" aria-hidden="true" />
                <div>
                  <strong>Seasonal farmer drops</strong>
                  <span>Fresh harvests as they hit the market</span>
                </div>
                <button type="button" className={`${styles.toggle} ${styles.toggleOn}`} aria-pressed="true" aria-label="Seasonal farmer drops subscribed" />
              </div>
              <div className={styles.newsletterItem}>
                <i className="fa-solid fa-kitchen-set" aria-hidden="true" />
                <div>
                  <strong>Chef recipes & meal plans</strong>
                  <span>Weekly inspiration for your kitchen</span>
                </div>
                <button type="button" className={styles.toggle} aria-pressed="false" aria-label="Chef recipes unsubscribed" />
              </div>
            </div>
          </div>
        );
      case "refunds":
        return renderEmptyState(
          "Refunds",
          "Refund requests and completed wallet reversals will appear here once available.",
          getAccountRoute("orders"),
          "Review orders"
        );
      case "referrals":
        return renderEmptyState(
          "Refer & Earn",
          "Referral rewards are being prepared for staging. Your invites and earned credits will appear here.",
          "/shop",
          "Continue shopping"
        );
      case "faqs":
        return renderEmptyState(
          "FAQs",
          "Find quick answers about ordering, delivery areas, payments, and refunds in the Meal05 help centre.",
          "/help-center",
          "Open help centre"
        );
      case "help":
        return renderEmptyState(
          "Help & support",
          "Need help with an order or account issue? Start from the support centre and our team will route the request.",
          "/contact-us",
          "Contact support"
        );
      case "notifications":
        return (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Notification settings</h3>
            <p className={styles.cardBody}>Control which account and order alerts Meal05 sends you.</p>
            <div className={styles.list}>
              {[
                ["Order updates", "Delivery status, substitutions, and completed order alerts", true],
                ["Wallet activity", "Top-up confirmations and Meal05 Balance changes", true],
                ["Promotions", "Offers, seasonal drops, and new store launches", false],
              ].map(([title, body, enabled]) => (
                <div key={title} className={styles.newsletterItem}>
                  <i className="fa-regular fa-bell" aria-hidden="true" />
                  <div>
                    <strong>{title}</strong>
                    <span>{body}</span>
                  </div>
                  <button
                    type="button"
                    className={`${styles.toggle} ${enabled ? styles.toggleOn : ""}`}
                    aria-pressed={enabled ? "true" : "false"}
                    aria-label={`${title} ${enabled ? "enabled" : "disabled"}`}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      case "legal":
        return (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Legal & System</h3>
            <div className={styles.list}>
              <div className={styles.listItem}>
                <i className="fa-regular fa-file-lines" aria-hidden="true" />
                <span>Terms of service</span>
                <Link href="/terms">Open</Link>
              </div>
              <div className={styles.listItem}>
                <i className="fa-solid fa-shield-halved" aria-hidden="true" />
                <span>Privacy policy</span>
                <Link href="/privacy">Open</Link>
              </div>
              <div className={styles.listItem}>
                <i className="fa-solid fa-code-branch" aria-hidden="true" />
                <span>App version</span>
                <span>Meal05 staging</span>
              </div>
            </div>
          </div>
        );
      default:
        return renderOverview();
    }
  };

  if (!hydrated) {
    return (
      <main className={styles.page}>
        <div className={styles.accountShell}>
          <div className={styles.skeleton}>Preparing your account...</div>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className={styles.page}>
        <div className={styles.accountShell}>
          <div className={styles.skeleton}>Redirecting to sign in...</div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.accountShell}>
        <section className={activeTab === "overview" ? styles.accountHubSurface : styles.sectionShell} aria-live="polite">
          {activeTab === "overview" ? (
            <header className={styles.header}>
              <span className={styles.headerEyebrow}>Account</span>
              <h1 className={styles.headerTitle}>My Account</h1>
              <p className={styles.headerSubtitle}>{ACCOUNT_SUBTITLES.overview}</p>
            </header>
          ) : (
            <header className={styles.sectionTopbar}>
              <Link href="/account" className={styles.sectionBackLink}>
                <i className="fa-solid fa-arrow-left" aria-hidden="true" />
                <span>Back</span>
              </Link>
              <div>
                <span className={styles.headerEyebrow}>Account</span>
                <h1 className={styles.sectionPageTitle}>
                  {ACCOUNT_TABS.find((tab) => tab.slug === activeTab)?.label ?? "My Account"}
                </h1>
                <p className={styles.headerSubtitle}>{ACCOUNT_SUBTITLES[activeTab] || ACCOUNT_SUBTITLES.overview}</p>
              </div>
            </header>
          )}
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

function DeliveryContactCard({ contactState }) {
  if (contactState?.status !== "ready" || !contactState?.available || !contactState?.rider) return null;
  const vehicle = [contactState.rider.vehicleType, contactState.rider.vehicleNumber].filter(Boolean).join(" · ");
  return (
    <div className={styles.deliveryContactCard}>
      <div className={styles.deliveryContactIdentity}>
        <div
          className={styles.deliveryContactAvatar}
          role="img"
          aria-label={`${contactState.rider.name} profile photo`}
          style={contactState.rider.photoUrl ? { backgroundImage: `url(${contactState.rider.photoUrl})` } : undefined}
        >
          {!contactState.rider.photoUrl ? contactState.rider.name.slice(0, 1).toUpperCase() : null}
        </div>
        <div>
          <span>Your rider</span>
          <strong>{contactState.rider.name}</strong>
          <small>{["Meal05 Rider", contactState.rider.riderCode].filter(Boolean).join(" · ")}</small>
          {vehicle ? <small>{vehicle}</small> : null}
        </div>
      </div>
      <div className={styles.deliveryContactActions}>
        <a href={contactState.rider.callUrl}>Call rider</a>
        <a href={contactState.rider.whatsappUrl} target="_blank" rel="noreferrer">WhatsApp</a>
      </div>
      {contactState.note ? <p>{contactState.note}</p> : null}
    </div>
  );
}

// Lightweight order tracking timeline component
function OrderTracker({ order }) {
  const steps = [
    { key: "pending", label: "Order placed" },
    { key: "payment", label: "Payment confirmed" },
    { key: "processing", label: "Processing" },
    { key: "ready_for_dispatch", label: "Ready for dispatch" },
    { key: "dispatched", label: "Dispatched" },
    { key: "delivered", label: "Delivered" },
  ];

  const statusKey = String(order?.status || "pending").toLowerCase().replace(/\s+/g, "_");
  const paymentStatus = String(order?.paymentStatus || "").toLowerCase();
  const currentIndex = (() => {
    if (["cancelled", "payment_failed", "stock_failed"].includes(statusKey) || paymentStatus === "rejected") return 0;
    if (statusKey === "delivered" || statusKey === "completed") return 5;
    if (["dispatched", "shipped", "in_transit"].includes(statusKey) || ["dispatched", "in transit"].includes(String(order?.deliveryStatus || "").toLowerCase())) return 4;
    if (statusKey === "ready_for_dispatch") return 3;
    if (statusKey === "processing") return 2;
    if (["confirmed"].includes(statusKey) || ["confirmed", "paid"].includes(paymentStatus)) return 1;
    return 0;
  })();

  const paymentAwaitingConfirmation = paymentStatus === "awaiting_confirmation";


  return (
    <div className={styles.orderTracker} role="status" aria-live="polite">
      {paymentAwaitingConfirmation ? <p className={styles.orderTrackerNotice}>Payment submitted — awaiting confirmation</p> : null}
      {paymentStatus === "rejected" ? <p className={styles.orderTrackerNotice}>Payment was rejected. Please contact support.</p> : null}
      <ol className={styles.orderTrackerSteps}>
        {steps.map((step, index) => {
          const className = [
            styles.orderTrackerStep,
            index === currentIndex ? styles.isActive : "",
            index <= currentIndex ? styles.isDone : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <li key={step.key} className={className}>
              <span aria-hidden="true">{index <= currentIndex ? "\u2713" : ""}</span>
              <strong>{step.label}</strong>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
