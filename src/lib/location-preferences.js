export const LOCATION_STORAGE_KEY = "meal05_location_preference";
export const LOCATION_EVENT = "meal05-location-changed";
export const CURRENT_LOCATION_ID = "current_location";
export const CURRENT_LOCATION_LABEL = "Current location";

const DEFAULT_CITY = "Ibadan";
const MAX_SHORT_LABEL = 28;

const normalizeText = (value) => String(value || "").trim();

const toTitleCase = (value) =>
  normalizeText(value)
    .toLowerCase()
    .replace(/(^|[\s/,(.-])([a-z])/g, (match, prefix, letter) => `${prefix}${letter.toUpperCase()}`);

const createFallbackAddressId = (line) =>
  `addr_${normalizeText(line).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "saved"}`;

const shortenLabel = (value, max = MAX_SHORT_LABEL) => {
  const text = toTitleCase(value);
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
};

const formatCoordinateValue = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "";
  return numeric.toFixed(5);
};

const formatCoordinatesLabel = (coords) => {
  if (!coords || typeof coords !== "object") return "";
  const latitude = formatCoordinateValue(coords.latitude);
  const longitude = formatCoordinateValue(coords.longitude);
  if (!latitude || !longitude) return "";
  return `${latitude}, ${longitude}`;
};

const normalizeAddressEntry = (entry) => {
  if (!entry || typeof entry !== "object") return null;
  const line = normalizeText(entry.line || entry.address);
  if (!line) return null;

  return {
    id: normalizeText(entry.id) || createFallbackAddressId(line),
    label: toTitleCase(entry.label || entry.title) || "Saved Address",
    line: toTitleCase(line),
    city: toTitleCase(entry.city) || DEFAULT_CITY,
  };
};

const buildCurrentLocationOption = (preference = null) => {
  const coordinatesLabel = formatCoordinatesLabel(preference?.coords);

  return {
    id: CURRENT_LOCATION_ID,
    type: "current",
    title: CURRENT_LOCATION_LABEL,
    line: coordinatesLabel,
    city: "",
    description: coordinatesLabel || "Use this device's live location",
    shortLabel: coordinatesLabel || CURRENT_LOCATION_LABEL,
    coords: preference?.coords || null,
    accuracy: preference?.accuracy ?? null,
    timestamp: preference?.timestamp ?? null,
    error: preference?.error || "",
  };
};

const buildAddressOption = (entry) => ({
  id: `address:${entry.id}`,
  type: "address",
  addressId: entry.id,
  title: entry.label,
  line: entry.line,
  city: entry.city,
  description: entry.city ? `${entry.line}, ${entry.city}` : entry.line,
  shortLabel: shortenLabel(entry.line || entry.city || entry.label),
});

export const getUserLocationAddresses = (user) => {
  if (!user || typeof user !== "object") return [];

  const seen = new Set();
  const addresses = [];
  const defaultAddressId = normalizeText(user.defaultAddressId);

  const addAddress = (entry) => {
    const normalized = normalizeAddressEntry(entry);
    if (!normalized) return;

    const dedupeKey = normalized.line.toLowerCase();
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    addresses.push(normalized);
  };

  if (Array.isArray(user.addresses)) {
    user.addresses.forEach(addAddress);
  }

  const legacyAddress = normalizeText(user.address);
  if (legacyAddress) {
    addAddress({
      id: defaultAddressId || createFallbackAddressId(legacyAddress),
      label: "Default address",
      line: legacyAddress,
      city: normalizeText(user.city) || DEFAULT_CITY,
    });
  }

  if (defaultAddressId) {
    addresses.sort((left, right) => {
      if (left.id === defaultAddressId) return -1;
      if (right.id === defaultAddressId) return 1;
      return 0;
    });
  }

  return addresses;
};

export const readStoredLocationPreference = () => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LOCATION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch (error) {
    console.warn("Unable to read stored location preference", error);
    return null;
  }
};

export const dispatchLocationChanged = (detail) => {
  if (typeof window === "undefined") return;

  try {
    window.dispatchEvent(new CustomEvent(LOCATION_EVENT, { detail }));
  } catch (error) {
    console.warn("Unable to dispatch location preference change", error);
  }
};

export const persistLocationPreference = (preference) => {
  if (typeof window === "undefined" || !preference) return;
  try {
    window.localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(preference));
    dispatchLocationChanged({ preference });
  } catch (error) {
    console.warn("Unable to persist location preference", error);
  }
};

export const clearLocationPreference = () => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LOCATION_STORAGE_KEY);
    dispatchLocationChanged({ preference: null });
  } catch (error) {
    console.warn("Unable to clear location preference", error);
  }
};

export const buildLocationOptions = (user, preference = readStoredLocationPreference()) => [
  buildCurrentLocationOption(preference?.type === "current" ? preference : null),
  ...getUserLocationAddresses(user).map(buildAddressOption),
];

export const resolveSelectedLocation = (user, preference = readStoredLocationPreference()) => {
  if (preference?.type === "resolved" && preference?.coords) {
    return { ...preference, shortLabel: shortenLabel(preference.line || preference.label || preference.zone?.name) };
  }
  const options = buildLocationOptions(user, preference);
  const addressOptions = options.filter((option) => option.type === "address");

  if (preference?.type === "address") {
    const preferredAddressId = normalizeText(preference.addressId);
    const preferredLine = normalizeText(preference.line).toLowerCase();
    const matchedAddress = addressOptions.find(
      (option) =>
        (preferredAddressId && option.addressId === preferredAddressId) ||
        (preferredLine && option.line.toLowerCase() === preferredLine)
    );
    if (matchedAddress) return matchedAddress;
  }

  if (preference?.type === "current") {
    return buildCurrentLocationOption(preference);
  }

  return addressOptions[0] || options[0];
};

export const toLocationPreference = (selection) => {
  if (!selection) {
    return {
      type: "current",
      label: CURRENT_LOCATION_LABEL,
    };
  }

  if (selection.type === "address") {
    return {
      type: "address",
      addressId: selection.addressId,
      label: selection.title,
      line: selection.line,
      city: selection.city,
    };
  }

  return {
    type: "current",
    label: CURRENT_LOCATION_LABEL,
    coords: selection.coords || null,
    accuracy: selection.accuracy ?? null,
    timestamp: selection.timestamp ?? null,
    error: normalizeText(selection.error),
  };
};

const mapGeolocationError = (error) => {
  if (!error) return "We couldn't access your device location.";

  switch (error.code) {
    case error.PERMISSION_DENIED:
      return "Location permission was denied.";
    case error.POSITION_UNAVAILABLE:
      return "Your device location is unavailable right now.";
    case error.TIMEOUT:
      return "Location request timed out.";
    default:
      return "We couldn't access your device location.";
  }
};

export const requestCurrentLocationPreference = () =>
  new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Device location is not supported on this browser."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          type: "current",
          label: CURRENT_LOCATION_LABEL,
          coords: {
            latitude: Number(position.coords.latitude.toFixed(6)),
            longitude: Number(position.coords.longitude.toFixed(6)),
          },
          accuracy: Math.round(position.coords.accuracy || 0),
          timestamp: position.timestamp || Date.now(),
          error: "",
        });
      },
      (error) => {
        reject(new Error(mapGeolocationError(error)));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000,
      }
    );
  });
