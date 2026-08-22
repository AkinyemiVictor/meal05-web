"use client";

import { useEffect, useState } from "react";

import {
  AUTH_EVENT,
  clearStoredUser,
  deriveStoredUserFromAuthUser,
  persistStoredUser,
  readStoredUser,
} from "@/lib/auth";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser-client";

let inFlightVerification = null;

const verifyCurrentUser = () => {
  // Responsive header variants mount at the same time. Share one Supabase
  // verification promise so they cannot independently call auth.getUser().
  if (inFlightVerification) return inFlightVerification;

  const fallbackUser = readStoredUser() || {};
  inFlightVerification = getBrowserSupabaseClient()
    .auth.getUser()
    .then(({ data, error }) => {
      if (error || !data?.user) {
        clearStoredUser();
        return null;
      }

      const verifiedUser = deriveStoredUserFromAuthUser(data.user, fallbackUser);
      // Persist once inside the shared promise. This also emits only one auth
      // change event for cart/wallet/header listeners instead of one per header.
      persistStoredUser(verifiedUser);
      return verifiedUser;
    })
    .catch(() => readStoredUser())
    .finally(() => {
      inFlightVerification = null;
    });

  return inFlightVerification;
};

export default function useSharedHeaderUser() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const update = (event) => {
      if (cancelled) return;
      const hasEventUser = event?.detail && Object.prototype.hasOwnProperty.call(event.detail, "user");
      setUser(hasEventUser ? event.detail.user : readStoredUser());
    };

    update();
    verifyCurrentUser().then((verifiedUser) => {
      if (cancelled) return;
      setUser(verifiedUser ?? readStoredUser());
    });

    window.addEventListener(AUTH_EVENT, update);
    window.addEventListener("storage", update);

    return () => {
      cancelled = true;
      window.removeEventListener(AUTH_EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, []);

  return user;
}
