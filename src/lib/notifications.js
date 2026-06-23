"use client";

import { readStoredUser } from "@/lib/auth";

const BASE_KEY = "meal05_notifications";
const GUEST_KEY = `${BASE_KEY}_guest`;
const MAX_NOTIFICATIONS = 80;

export const NOTIFICATIONS_EVENT = "meal05-notifications-changed";

const normaliseEmail = (email) =>
  typeof email === "string" ? email.trim().toLowerCase() : "";

const getNotificationKeyForUser = (user = readStoredUser()) => {
  const emailKey = normaliseEmail(user?.email);
  return emailKey ? `${BASE_KEY}_${emailKey}` : GUEST_KEY;
};

const dispatchNotificationsChanged = (detail = {}) => {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(NOTIFICATIONS_EVENT, { detail }));
  } catch (error) {
    console.warn("Unable to dispatch notification event", error);
  }
};

const normaliseNotification = (notification) => {
  if (!notification || typeof notification !== "object") return null;
  const createdAt = notification.createdAt || new Date().toISOString();
  const id = String(notification.id || `${notification.type || "notice"}-${createdAt}`).trim();
  if (!id) return null;

  return {
    id,
    type: notification.type || "system",
    title: String(notification.title || "Meal05 update").trim(),
    body: String(notification.body || "").trim(),
    href: notification.href || "/notifications",
    createdAt,
    read: Boolean(notification.read),
    meta: notification.meta && typeof notification.meta === "object" ? notification.meta : {},
  };
};

const sortNotifications = (items) =>
  [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

export const readNotifications = (user = readStoredUser()) => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(getNotificationKeyForUser(user));
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return sortNotifications(parsed.map(normaliseNotification).filter(Boolean));
  } catch (error) {
    console.warn("Unable to read notifications", error);
    return [];
  }
};

const writeNotifications = (items, user = readStoredUser(), detail = {}) => {
  if (typeof window === "undefined") return [];
  const next = sortNotifications(items.map(normaliseNotification).filter(Boolean)).slice(0, MAX_NOTIFICATIONS);
  try {
    window.localStorage.setItem(getNotificationKeyForUser(user), JSON.stringify(next));
    dispatchNotificationsChanged({ user: user ? { email: user.email } : null, ...detail });
  } catch (error) {
    console.warn("Unable to persist notifications", error);
  }
  return next;
};

export const addNotification = (notification, user = readStoredUser()) => {
  const nextNotification = normaliseNotification(notification);
  if (!nextNotification) return null;

  const current = readNotifications(user);
  const existingIndex = current.findIndex((item) => item.id === nextNotification.id);
  const next =
    existingIndex >= 0
      ? current.map((item, index) =>
          index === existingIndex
            ? { ...item, ...nextNotification, read: nextNotification.read || false }
            : item
        )
      : [nextNotification, ...current];

  writeNotifications(next, user, { reason: "add", id: nextNotification.id });
  return nextNotification;
};

export const markNotificationRead = (id, user = readStoredUser()) => {
  const current = readNotifications(user);
  writeNotifications(
    current.map((item) => (item.id === id ? { ...item, read: true } : item)),
    user,
    { reason: "mark-read", id }
  );
};

export const markAllNotificationsRead = (user = readStoredUser()) => {
  const current = readNotifications(user);
  writeNotifications(
    current.map((item) => ({ ...item, read: true })),
    user,
    { reason: "mark-all-read" }
  );
};

export const deleteNotification = (id, user = readStoredUser()) => {
  const current = readNotifications(user);
  writeNotifications(
    current.filter((item) => item.id !== id),
    user,
    { reason: "delete", id }
  );
};

export const clearReadNotifications = (user = readStoredUser()) => {
  const current = readNotifications(user);
  writeNotifications(
    current.filter((item) => !item.read),
    user,
    { reason: "clear-read" }
  );
};

export const getUnreadNotificationCount = (user = readStoredUser()) =>
  readNotifications(user).filter((item) => !item.read).length;

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(Number(value)) ? Number(value) : 0);

const getOrderTotal = (order) =>
  Number(order?.summary?.total ?? order?.total ?? order?.amount ?? 0);

const getCartSignature = (items) =>
  (Array.isArray(items) ? items : [])
    .map((item) => `${item.variantId || item.productId || item.id}:${item.orderCount || item.quantity || 1}`)
    .sort()
    .join("|");

export const syncDerivedNotifications = ({ orders = [], cartItems = [], user = readStoredUser() } = {}) => {
  const current = readNotifications(user);
  const byId = new Map(current.map((item) => [item.id, item]));
  let changed = false;

  (Array.isArray(orders) ? orders : []).slice(0, 8).forEach((order) => {
    const orderId = order?.orderId || order?.id;
    if (!orderId) return;
    const status = String(order.status || "processing").toLowerCase();
    const id = `order-${orderId}-${status}`;
    if (byId.has(id)) return;
    changed = true;
    byId.set(id, {
      id,
      type: "order",
      title: status === "delivered" ? "Order delivered" : "Order update",
      body: `${orderId} is ${status.replace(/-/g, " ")}${getOrderTotal(order) ? ` · ${formatCurrency(getOrderTotal(order))}` : ""}.`,
      href: "/account?tab=orders",
      createdAt: order.updatedAt || order.placedAt || order.createdAt || new Date().toISOString(),
      read: false,
      meta: { orderId, status },
    });
  });

  const cart = Array.isArray(cartItems) ? cartItems : [];
  const cartId = "saved-cart";
  const signature = getCartSignature(cart);
  const existingCartNotification = byId.get(cartId);
  if (cart.length) {
    const itemLabel = cart.length === 1 ? "item" : "items";
    const nextCartNotification = {
      id: cartId,
      type: "cart",
      title: "Saved cart waiting",
      body: `${cart.length} ${itemLabel} are ready in your cart. Review them before checkout.`,
      href: "/cart",
      createdAt: existingCartNotification?.createdAt || new Date().toISOString(),
      read: existingCartNotification?.meta?.signature === signature ? Boolean(existingCartNotification?.read) : false,
      meta: { signature, itemCount: cart.length },
    };
    if (
      !existingCartNotification ||
      existingCartNotification.meta?.signature !== signature ||
      existingCartNotification.read !== nextCartNotification.read
    ) {
      changed = true;
      byId.set(cartId, nextCartNotification);
    }
  } else if (byId.has(cartId)) {
    changed = true;
    byId.delete(cartId);
  }

  const next = sortNotifications(Array.from(byId.values()));
  if (changed) {
    return writeNotifications(next, user, { reason: "sync-derived" });
  }
  return next;
};
