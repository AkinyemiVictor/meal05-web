"use client";

import { useEffect, useState } from "react";

import { AUTH_EVENT, readStoredUser } from "@/lib/auth";

export const WALLET_REFRESH_EVENT = "meal05:wallet-refresh";

const REMOTE_WALLET_REUSE_MS = 2000;
const inFlightByUser = new Map();
const snapshotByUser = new Map();

const idleWallet = () => ({ balance: 0, currencyCode: "NGN", status: "idle" });

const getUserKey = (user = readStoredUser()) => {
  const raw = user?.id || user?.email || "";
  return String(raw).trim().toLowerCase();
};

const normalizeWallet = (payload = {}) => ({
  balance: Number(payload?.balance) || 0,
  currencyCode: payload?.currencyCode || payload?.currency_code || "NGN",
  status: "ready",
});

const rememberWallet = (userKey, wallet) => {
  if (!userKey || !wallet) return;
  snapshotByUser.set(userKey, { wallet, at: Date.now() });
};

const loadRemoteWallet = ({ force = false } = {}) => {
  const userKey = getUserKey();
  if (!userKey) return Promise.resolve(null);

  const cached = snapshotByUser.get(userKey);
  if (!force && cached && Date.now() - cached.at < REMOTE_WALLET_REUSE_MS) {
    return Promise.resolve({ userKey, wallet: cached.wallet });
  }

  // Both responsive header instances share this promise. A single page/auth
  // event therefore results in one /api/wallet request rather than one request
  // per mounted header.
  if (inFlightByUser.has(userKey)) return inFlightByUser.get(userKey);

  const request = fetch("/api/wallet", { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) return null;
      const payload = await response.json().catch(() => ({}));
      const wallet = normalizeWallet(payload);
      rememberWallet(userKey, wallet);
      return { userKey, wallet };
    })
    .catch(() => null)
    .finally(() => {
      inFlightByUser.delete(userKey);
    });

  inFlightByUser.set(userKey, request);
  return request;
};

export default function useSharedWalletBalance(user) {
  const [wallet, setWallet] = useState(idleWallet);

  useEffect(() => {
    let cancelled = false;

    const update = async (event) => {
      const userKey = getUserKey();
      if (!userKey) {
        if (!cancelled) setWallet(idleWallet());
        return;
      }

      const detail = event?.detail;
      if (detail && typeof detail === "object" && "balance" in detail) {
        const nextWallet = normalizeWallet(detail);
        rememberWallet(userKey, nextWallet);
        if (!cancelled) setWallet(nextWallet);
        return;
      }

      if (!cancelled) {
        setWallet((current) => ({ ...current, status: "loading" }));
      }

      const forceRemote = event?.type === WALLET_REFRESH_EVENT || event?.type === "storage";
      const result = await loadRemoteWallet({ force: forceRemote });
      if (cancelled) return;

      if (!result?.wallet) {
        setWallet((current) => ({ ...current, status: "error" }));
        return;
      }

      // Do not let a response started for a previous signed-in account update a
      // newly signed-in account after an auth switch.
      if (getUserKey() !== result.userKey) return;
      setWallet(result.wallet);
    };

    update();
    window.addEventListener(AUTH_EVENT, update);
    window.addEventListener("storage", update);
    window.addEventListener(WALLET_REFRESH_EVENT, update);

    return () => {
      cancelled = true;
      window.removeEventListener(AUTH_EVENT, update);
      window.removeEventListener("storage", update);
      window.removeEventListener(WALLET_REFRESH_EVENT, update);
    };
  }, [user?.id, user?.email]);

  return wallet;
}
