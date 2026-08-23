"use client";

import { useEffect, useState } from "react";

import { AUTH_EVENT, readStoredUser } from "@/lib/auth";
import { readCartItems } from "@/lib/cart-storage";
import { ORDERS_EVENT, readUserOrders } from "@/lib/orders";
import {
  NOTIFICATIONS_EVENT,
  getUnreadNotificationCount,
  syncDerivedNotifications,
} from "@/lib/notifications";

let currentCount = 0;
let listenersInstalled = false;
let syncing = false;
const subscribers = new Set();

const publish = (nextCount) => {
  currentCount = Number(nextCount) || 0;
  subscribers.forEach((subscriber) => subscriber(currentCount));
};

const refresh = ({ syncDerived = true } = {}) => {
  if (typeof window === "undefined" || syncing) return;

  syncing = true;
  try {
    const activeUser = readStoredUser();
    if (syncDerived) {
      const notifications = syncDerivedNotifications({
        orders: readUserOrders(activeUser),
        cartItems: readCartItems(activeUser),
        user: activeUser,
      });
      publish((Array.isArray(notifications) ? notifications : []).filter((item) => !item.read).length);
      return;
    }

    publish(getUnreadNotificationCount(activeUser));
  } finally {
    syncing = false;
  }
};

const handleDerivedSourceChange = () => refresh({ syncDerived: true });
const handleNotificationChange = () => refresh({ syncDerived: false });

const installListeners = () => {
  if (listenersInstalled || typeof window === "undefined") return;
  listenersInstalled = true;

  window.addEventListener("storage", handleDerivedSourceChange);
  window.addEventListener("cart-updated", handleDerivedSourceChange);
  window.addEventListener(AUTH_EVENT, handleDerivedSourceChange);
  window.addEventListener(ORDERS_EVENT, handleDerivedSourceChange);
  window.addEventListener(NOTIFICATIONS_EVENT, handleNotificationChange);

  refresh({ syncDerived: true });
};

const removeListeners = () => {
  if (!listenersInstalled || typeof window === "undefined" || subscribers.size > 0) return;
  listenersInstalled = false;

  window.removeEventListener("storage", handleDerivedSourceChange);
  window.removeEventListener("cart-updated", handleDerivedSourceChange);
  window.removeEventListener(AUTH_EVENT, handleDerivedSourceChange);
  window.removeEventListener(ORDERS_EVENT, handleDerivedSourceChange);
  window.removeEventListener(NOTIFICATIONS_EVENT, handleNotificationChange);
};

export default function useSharedUnreadNotificationCount() {
  const [count, setCount] = useState(currentCount);

  useEffect(() => {
    subscribers.add(setCount);
    installListeners();
    setCount(currentCount);

    return () => {
      subscribers.delete(setCount);
      removeListeners();
    };
  }, []);

  return count;
}
