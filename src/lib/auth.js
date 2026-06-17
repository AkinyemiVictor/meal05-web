export const AUTH_STORAGE_KEY = "meal05_user";
export const AUTH_EVENT = "meal05-auth-changed";

export const readStoredUser = () => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch (error) {
    console.warn("Unable to read stored user", error);
    return null;
  }
};

export const persistStoredUser = (user) => {
  if (typeof window === "undefined" || !user) return;
  try {
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    dispatchAuthChanged({ user });
  } catch (error) {
    console.warn("Unable to persist user", error);
  }
};

export const clearStoredUser = () => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    dispatchAuthChanged({ user: null });
  } catch (error) {
    console.warn("Unable to clear stored user", error);
  }
};

export const dispatchAuthChanged = (detail) => {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail }));
  } catch (error) {
    console.warn("Unable to dispatch auth event", error);
  }
};
