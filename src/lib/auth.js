export const AUTH_STORAGE_KEY = "meal05_user";
export const AUTH_EVENT = "meal05-auth-changed";

const cleanText = (value) => String(value || "").trim();

const titleCaseName = (value) =>
  cleanText(value)
    .replace(/[._-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");

export const deriveStoredUserFromAuthUser = (authUser, fallback = {}) => {
  const metadata = authUser?.user_metadata || {};
  const email = cleanText(authUser?.email || fallback.email).toLowerCase();
  const metadataFullName = cleanText(metadata.full_name || metadata.name || metadata.user_name || fallback.fullName);
  const metadataFirstName = cleanText(metadata.first_name || fallback.firstName);
  const metadataLastName = cleanText(metadata.last_name || fallback.lastName);
  const emailName = email.includes("@") ? email.split("@")[0] : "";
  const fullNameSource = metadataFullName || [metadataFirstName, metadataLastName].filter(Boolean).join(" ") || emailName;
  const nameParts = titleCaseName(fullNameSource).split(/\s+/).filter(Boolean);
  const firstName = titleCaseName(metadataFirstName || nameParts[0] || "");
  const lastName = titleCaseName(metadataLastName || nameParts.slice(1).join(" "));
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || titleCaseName(fullNameSource) || "Customer";
  const phone = cleanText(metadata.phone || fallback.phone);

  return {
    id: authUser?.id || fallback.id,
    firstName,
    lastName,
    fullName,
    email,
    ...(phone ? { phone } : {}),
  };
};

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
