"use client";

import { readStoredUser } from "./auth";

const ORDERS_KEY_PREFIX = "mealkit_orders";
export const ORDERS_EVENT = "mealkit-orders-changed";

const normaliseEmail = (email) =>
  typeof email === "string" ? email.trim().toLowerCase() : "";

const getOrdersKeyForUser = (user = readStoredUser()) => {
  const emailKey = normaliseEmail(user?.email);
  return emailKey ? `${ORDERS_KEY_PREFIX}_${emailKey}` : `${ORDERS_KEY_PREFIX}_guest`;
};

const readRawOrders = (user) => {
  if (typeof window === "undefined") return [];
  try {
    const key = getOrdersKeyForUser(user);
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("Unable to read orders", error);
    return [];
  }
};

const writeRawOrders = (orders, user) => {
  if (typeof window === "undefined") return;
  try {
    const key = getOrdersKeyForUser(user);
    window.localStorage.setItem(key, JSON.stringify(orders ?? []));
    dispatchOrdersChanged({ user: user ? { email: user.email } : null });
  } catch (error) {
    console.warn("Unable to persist orders", error);
  }
};

export const readUserOrders = (user) => readRawOrders(user);

export const addUserOrder = (order, status = "processing", user = readStoredUser()) => {
  const orders = readRawOrders(user);
  const placedAt = order.createdAt || new Date().toISOString();
  const orderRecord = {
    ...order,
    status,
    placedAt,
  };
  orders.unshift(orderRecord);
  writeRawOrders(orders, user);
  return orderRecord;
};

export const updateUserOrderStatus = (orderId, status, user = readStoredUser()) => {
  const orders = readRawOrders(user);
  const index = orders.findIndex((order) => order.orderId === orderId);
  if (index === -1) return null;
  orders[index] = { ...orders[index], status };
  writeRawOrders(orders, user);
  return orders[index];
};

export const dispatchOrdersChanged = (detail) => {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(ORDERS_EVENT, { detail }));
  } catch (error) {
    console.warn("Unable to dispatch orders event", error);
  }
};

// Replace the current user's orders with a new list
export const setUserOrders = (orders, user = readStoredUser()) => {
  writeRawOrders(Array.isArray(orders) ? orders : [], user);
  return readRawOrders(user);
};
