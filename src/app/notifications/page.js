"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  IconBell,
  IconCheck,
  IconChevronRight,
  IconCircleCheck,
  IconClock,
  IconShoppingCart,
  IconTrash,
} from "@tabler/icons-react";

import PageBreadcrumbs from "@/components/page-breadcrumbs";
import { AUTH_EVENT, readStoredUser } from "@/lib/auth";
import { buildSignInHref } from "@/lib/auth-redirect";
import { CART_UPDATED_EVENT, readCartItems } from "@/lib/cart-storage";
import { ORDERS_EVENT, readUserOrders } from "@/lib/orders";
import {
  NOTIFICATIONS_EVENT,
  clearReadNotifications,
  deleteNotification,
  markAllNotificationsRead,
  markNotificationRead,
  readNotifications,
  syncDerivedNotifications,
} from "@/lib/notifications";

const getRelativeTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = date.getTime() - Date.now();
  const absSeconds = Math.max(1, Math.round(Math.abs(diffMs) / 1000));
  const units = [
    ["year", 60 * 60 * 24 * 365],
    ["month", 60 * 60 * 24 * 30],
    ["week", 60 * 60 * 24 * 7],
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
    ["second", 1],
  ];
  const [unit, seconds] = units.find(([, unitSeconds]) => absSeconds >= unitSeconds) || units.at(-1);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  return formatter.format(Math.round(diffMs / 1000 / seconds), unit);
};

const getNotificationIcon = (type) => {
  if (type === "order") return IconShoppingCart;
  if (type === "cart") return IconBell;
  if (type === "success") return IconCircleCheck;
  return IconClock;
};

export default function NotificationsPage() {
  const [user, setUser] = useState(null);
  const [notifications, setNotifications] = useState([]);

  const refreshNotifications = useCallback(() => {
    const activeUser = readStoredUser();
    setUser(activeUser);
    const synced = syncDerivedNotifications({
      orders: readUserOrders(activeUser),
      cartItems: readCartItems(activeUser),
      user: activeUser,
    });
    setNotifications(synced.length ? synced : readNotifications(activeUser));
  }, []);

  useEffect(() => {
    refreshNotifications();
    window.addEventListener("storage", refreshNotifications);
    window.addEventListener(AUTH_EVENT, refreshNotifications);
    window.addEventListener(ORDERS_EVENT, refreshNotifications);
    window.addEventListener(CART_UPDATED_EVENT, refreshNotifications);
    window.addEventListener(NOTIFICATIONS_EVENT, refreshNotifications);
    return () => {
      window.removeEventListener("storage", refreshNotifications);
      window.removeEventListener(AUTH_EVENT, refreshNotifications);
      window.removeEventListener(ORDERS_EVENT, refreshNotifications);
      window.removeEventListener(CART_UPDATED_EVENT, refreshNotifications);
      window.removeEventListener(NOTIFICATIONS_EVENT, refreshNotifications);
    };
  }, [refreshNotifications]);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.read).length,
    [notifications]
  );
  const signInHref = buildSignInHref({ tab: "login", next: "/notifications", hash: "loginForm" });

  const handleMarkAllRead = () => {
    markAllNotificationsRead(user);
    refreshNotifications();
  };

  const handleClearRead = () => {
    clearReadNotifications(user);
    refreshNotifications();
  };

  const handleDelete = (id) => {
    deleteNotification(id, user);
    refreshNotifications();
  };

  const handleOpen = (notification) => {
    if (!notification.read) {
      markNotificationRead(notification.id, user);
    }
  };

  return (
    <main className="category-page">
      <PageBreadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Notifications" },
        ]}
      />

      <header className="category-page__header">
        <div className="category-page__title">
          <div>
            <span className="category-page__eyebrow">Updates</span>
            <h1 className="categoryCard__label">Notifications</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleMarkAllRead}
            disabled={!unreadCount}
            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-meal-line bg-meal-paper px-4 text-sm font-extrabold text-meal-text transition hover:border-meal-pepper hover:text-meal-pepper disabled:cursor-not-allowed disabled:opacity-45"
          >
            <IconCheck size={18} stroke={2} />
            Mark all read
          </button>
          <button
            type="button"
            onClick={handleClearRead}
            disabled={!notifications.some((notification) => notification.read)}
            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-meal-line bg-meal-paper px-4 text-sm font-extrabold text-meal-text transition hover:border-meal-pepper hover:text-meal-pepper disabled:cursor-not-allowed disabled:opacity-45"
          >
            <IconTrash size={18} stroke={2} />
            Clear read
          </button>
        </div>
      </header>

      {!user ? (
        <section className="mx-auto w-full max-w-[1200px] rounded-[28px] border border-meal-line bg-meal-paper p-5 shadow-soft md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-extrabold text-meal-text">Sign in for order notifications</h2>
              <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-meal-muted">
                Guest cart reminders can show here, but order alerts and delivery updates work best when you sign in.
              </p>
            </div>
            <Link
              href={signInHref}
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-meal-ink px-5 text-sm font-extrabold text-meal-paper transition hover:bg-meal-pepper"
            >
              Sign in
            </Link>
          </div>
        </section>
      ) : null}

      <section className="mx-auto mt-6 grid w-full max-w-[1200px] gap-3" aria-live="polite">
        {notifications.length ? (
          notifications.map((notification) => {
            const Icon = getNotificationIcon(notification.type);
            return (
              <article
                key={notification.id}
                className={`grid gap-4 rounded-[24px] border bg-meal-paper p-4 shadow-soft md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center ${
                  notification.read ? "border-meal-line" : "border-meal-pepper/35"
                }`}
              >
                <span
                  className={`grid h-12 w-12 place-items-center rounded-2xl ${
                    notification.read ? "bg-meal-mist text-meal-muted" : "bg-meal-pepper text-meal-paper"
                  }`}
                  aria-hidden="true"
                >
                  <Icon size={22} stroke={1.9} />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="m-0 text-base font-extrabold text-meal-text">{notification.title}</h2>
                    {!notification.read ? (
                      <span className="rounded-full bg-meal-green/15 px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-meal-green">
                        New
                      </span>
                    ) : null}
                  </div>
                  {notification.body ? (
                    <p className="mt-1 text-sm font-medium leading-6 text-meal-muted">{notification.body}</p>
                  ) : null}
                  <p className="mt-2 text-xs font-extrabold uppercase tracking-[0.18em] text-meal-muted">
                    {getRelativeTime(notification.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2 md:justify-end">
                  <Link
                    href={notification.href || "/notifications"}
                    onClick={() => handleOpen(notification)}
                    className="inline-flex h-11 items-center gap-2 rounded-2xl bg-meal-ink px-4 text-sm font-extrabold text-meal-paper transition hover:bg-meal-pepper"
                  >
                    Open
                    <IconChevronRight size={17} stroke={2} />
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDelete(notification.id)}
                    className="grid h-11 w-11 place-items-center rounded-2xl border border-meal-line text-meal-muted transition hover:border-meal-pepper hover:text-meal-pepper"
                    aria-label={`Delete ${notification.title}`}
                  >
                    <IconTrash size={18} stroke={2} />
                  </button>
                </div>
              </article>
            );
          })
        ) : (
          <div className="rounded-[28px] border border-dashed border-meal-line bg-meal-paper p-8 text-center shadow-soft">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-meal-mist text-meal-muted">
              <IconBell size={26} stroke={1.8} />
            </div>
            <h2 className="mt-4 text-xl font-extrabold text-meal-text">No notifications yet</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm font-medium leading-6 text-meal-muted">
              We will add order updates, delivery changes, saved-cart reminders, and important account alerts here.
            </p>
            <Link
              href="/shop"
              className="mt-5 inline-flex h-11 items-center justify-center rounded-2xl bg-meal-pepper px-5 text-sm font-extrabold text-meal-paper transition hover:bg-meal-ink"
            >
              Browse products
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
