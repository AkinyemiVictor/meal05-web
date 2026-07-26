"use client";

import "leaflet/dist/leaflet.css";

import Link from "next/link";
import { IconCurrentLocation, IconMapPin, IconSearch, IconX } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  LOCATION_EVENT,
  persistLocationPreference,
  readStoredLocationPreference,
  requestCurrentLocationPreference,
} from "@/lib/location-preferences";
import styles from "./location-picker.module.css";

const HUB = { lat: 7.342134, lng: 3.847802 };
const LOW_ACCURACY_METRES = 1000;

const distanceFromHubKm = (latitude, longitude) => {
  const radians = (value) => (value * Math.PI) / 180;
  const dLat = radians(latitude - HUB.lat);
  const dLng = radians(longitude - HUB.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(HUB.lat)) *
      Math.cos(radians(latitude)) *
      Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const formatAccuracy = (metres) =>
  metres >= 1000 ? `+/- ${(metres / 1000).toFixed(1)} km` : `+/- ${Math.round(metres)} m`;

const geocode = async (body) => {
  const response = await fetch("/api/location/geocode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Address search failed.");
  return data.results || [];
};

export default function LocationPicker({
  landing = false,
  autoOpen = false,
  hideTrigger = false,
  initialOpen = false,
  pageMode = false,
}) {
  const [open, setOpen] = useState(initialOpen);
  const [preference, setPreference] = useState(null);
  const [areas, setAreas] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [serviceable, setServiceable] = useState(null);
  const [address, setAddress] = useState("");
  const [point, setPoint] = useState(null);

  const mapNode = useRef(null);
  const map = useRef(null);
  const marker = useRef(null);
  const accuracyCircle = useRef(null);
  const leaflet = useRef(null);
  const isActive = pageMode || open;

  const closePicker = useCallback(() => {
    if (!pageMode) setOpen(false);
  }, [pageMode]);

  const selectPoint = useCallback(async (location, provider = "openstreetmap", reverse = false, accuracy = null) => {
    const latitude = Number(location.lat);
    const longitude = Number(location.lng);
    const numericAccuracy = Number.isFinite(Number(accuracy)) ? Math.max(0, Number(accuracy)) : null;
    const reliable = numericAccuracy == null || numericAccuracy <= LOW_ACCURACY_METRES;

    setPoint({ latitude, longitude, provider, accuracy: numericAccuracy, reliable });
    setServiceable(null);
    marker.current?.setLatLng([latitude, longitude]);
    map.current?.panTo([latitude, longitude]);

    accuracyCircle.current?.remove();
    accuracyCircle.current = null;
    if (numericAccuracy && leaflet.current && map.current) {
      accuracyCircle.current = leaflet.current
        .circle([latitude, longitude], {
          radius: numericAccuracy,
          color: "#1787e8",
          weight: 1,
          fillColor: "#4aa3f0",
          fillOpacity: 0.12,
        })
        .addTo(map.current);
      if (numericAccuracy > 500) {
        map.current.fitBounds(accuracyCircle.current.getBounds(), { padding: [22, 22], maxZoom: 14 });
      }
    }

    if (reverse) {
      try {
        const [result] = await geocode({ mode: "reverse", latitude, longitude });
        if (result?.label) setAddress(result.label);
      } catch {}
    }
  }, []);

  useEffect(() => {
    const sync = (event) => {
      setPreference(event?.detail?.preference ?? readStoredLocationPreference());
    };

    sync();
    window.addEventListener(LOCATION_EVENT, sync);
    return () => window.removeEventListener(LOCATION_EVENT, sync);
  }, []);

  useEffect(() => {
    if (autoOpen && !pageMode && !readStoredLocationPreference()) setOpen(true);
  }, [autoOpen, pageMode]);

  useEffect(() => {
    if (!isActive) return;
    fetch("/api/location/serviceability")
      .then((response) => response.json())
      .then((data) => setAreas((data.areas || []).slice(0, 8)))
      .catch(() => {});
  }, [isActive]);

  useEffect(() => {
    if (!isActive || !mapNode.current) return undefined;

    let cancelled = false;
    import("leaflet")
      .then((module) => {
        if (cancelled || !mapNode.current) return;
        const L = module.default || module;
        leaflet.current = L;
        map.current = L.map(mapNode.current, { center: HUB, zoom: 13 });
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map.current);
        const icon = L.divIcon({
          className: "meal05-map-pin",
          html: '<span aria-hidden="true">●</span>',
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        });
        marker.current = L.marker(HUB, { draggable: true, icon }).addTo(map.current);
        marker.current.on("dragend", () => selectPoint(marker.current.getLatLng(), "openstreetmap", true));
        map.current.on("click", (event) => selectPoint(event.latlng, "openstreetmap", true));
      })
      .catch(() => setMessage("The map could not load. You can still use device GPS."));

    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      marker.current = null;
      accuracyCircle.current = null;
      leaflet.current = null;
    };
  }, [isActive, selectPoint]);

  const useGps = async () => {
    setBusy(true);
    setMessage("");
    try {
      const gps = await requestCurrentLocationPreference();
      const accuracy = Number(gps.accuracy || 0);
      const distanceKm = distanceFromHubKm(gps.coords.latitude, gps.coords.longitude);
      await selectPoint(
        { lat: gps.coords.latitude, lng: gps.coords.longitude },
        "device",
        accuracy <= LOW_ACCURACY_METRES,
        accuracy
      );
      if (accuracy > LOW_ACCURACY_METRES) {
        setAddress(`Approximate device location (${formatAccuracy(accuracy)})`);
        setMessage(`GPS accuracy is ${formatAccuracy(accuracy)}. Search your area or tap the map to set the entrance.`);
      } else if (distanceKm > 30) {
        setMessage("Your device placed you outside Ibadan. Search your Ibadan area if that is incorrect.");
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const searchAddress = async (requestedAddress = "") => {
    const query = typeof requestedAddress === "string" && requestedAddress ? requestedAddress : address;
    if (!query.trim()) return;

    setBusy(true);
    setMessage("");
    try {
      const [result] = await geocode({ mode: "search", query });
      if (!result) throw new Error("We could not find that place. Try a nearby estate or landmark.");
      setAddress(result.label || query);
      await selectPoint({ lat: result.latitude, lng: result.longitude }, "photon");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!point) {
      setMessage("Search, use GPS, or place the map pin first.");
      return;
    }
    if (point.reliable === false) {
      setMessage("This device reading is too imprecise. Search your area or tap the map to set an exact pin.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/location/serviceability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...point, formattedAddress: address, provider: point.provider }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Location check failed.");
      setServiceable(data.serviceable);

      if (data.serviceable) {
        const next = {
          type: "resolved",
          label: address || data.zone.name,
          line: address,
          city: "Ibadan",
          coords: data.coordinates,
          zone: data.zone,
          serviceable: true,
          provider: data.provider,
          timestamp: Date.now(),
        };
        persistLocationPreference(next);
        setPreference(next);
        setMessage(`Delivery is available here (${data.zone.name}).`);
        if (!pageMode) setTimeout(() => setOpen(false), 650);
      } else {
        setMessage("We are not delivering to this exact location yet. Join the waitlist and we will notify you when we expand.");
      }
    } catch (error) {
      setMessage(error.message);
      setServiceable(false);
    } finally {
      setBusy(false);
    }
  };

  const label = preference?.serviceable ? preference.line || preference.zone?.name : "Select location";
  const triggerLabel = label?.length > 24 ? `${label.slice(0, 24)}...` : label;

  const dialog = (
    <section
      className={`${styles.dialog} ${pageMode ? styles.pageDialog : ""}`}
      role={pageMode ? "region" : "dialog"}
      aria-modal={pageMode ? undefined : "true"}
      aria-labelledby="location-title"
    >
      <header className={`${styles.head} ${pageMode ? styles.pageHead : ""}`}>
        {!pageMode ? (
          <span className={styles.headIcon}>
            <IconMapPin size={22} />
          </span>
        ) : null}
        <div>
          <span className={styles.eyebrow}>Delivery coverage</span>
          <h2 id="location-title">{pageMode ? "Delivery location" : "Where should we deliver?"}</h2>
          {!pageMode ? <p>Choose your location, then place the pin at your exact entrance.</p> : null}
        </div>
        {!pageMode ? (
          <button type="button" className={styles.close} onClick={closePicker} aria-label="Close location picker">
            <IconX size={20} />
          </button>
        ) : null}
      </header>

      <div className={styles.body}>
        <div className={styles.controls}>
          <button type="button" className={styles.gps} disabled={busy} onClick={useGps}>
            <span>
              <IconCurrentLocation size={21} />
            </span>
            <div>
              <strong>{busy ? "Finding your location..." : "Use my current location"}</strong>
              <small>Allow GPS for the fastest setup</small>
            </div>
          </button>

          <div className={styles.or}>
            <span>or search manually</span>
          </div>

          <label className={styles.searchLabel}>
            <span>Area, estate or landmark</span>
            <div className={styles.search}>
              <IconSearch size={18} />
              <input
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") searchAddress();
                }}
                placeholder="e.g. Elebu or Oluyole Estate"
              />
              <button type="button" onClick={() => searchAddress()} disabled={busy}>
                Search
              </button>
            </div>
          </label>

          <div className={styles.popular}>
            <span>Popular nearby areas</span>
            <div className={styles.areas}>
              {areas.map((area) => (
                <button
                  type="button"
                  key={area.id}
                  onClick={() => {
                    setAddress(area.name);
                    searchAddress(area.name);
                  }}
                >
                  {area.name}
                </button>
              ))}
            </div>
          </div>

          <div
            className={`${styles.selection} ${point ? styles.selectionActive : ""} ${
              point?.reliable === false ? styles.selectionWarning : ""
            }`}
          >
            <IconMapPin size={18} />
            <div>
              <small>{point?.reliable === false ? `Low accuracy ${formatAccuracy(point.accuracy)}` : point ? "Selected location" : "No pin selected yet"}</small>
              <strong>{point ? address || `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}` : "Search, use GPS, or tap the map"}</strong>
            </div>
          </div>
        </div>

        <div className={styles.mapPanel}>
          <div className={styles.mapTop}>
            <span>
              <b>Set the exact pin</b>
              <small>The pin determines delivery eligibility</small>
            </span>
            {point ? <em>{point.reliable === false ? "Approximate" : "Pin selected"}</em> : null}
          </div>
          <div ref={mapNode} className={styles.map} />
          <p className={styles.hint}>
            <IconMapPin size={15} /> Tap or drag the pin to your entrance.
          </p>
        </div>
      </div>

      {message ? (
        <div className={`${styles.result} ${serviceable ? styles.success : ""}`}>
          {message}
          {serviceable === false ? (
            <>
              <br />
              <Link className={styles.waitlist} href="/#waitlist" onClick={closePicker}>
                Join the delivery-area waitlist
              </Link>
            </>
          ) : null}
        </div>
      ) : null}

      <footer className={styles.footer}>
        <p>
          <b>5 km launch zone</b>
          <span>Exact coverage is checked before checkout.</span>
        </p>
        <button type="button" className={styles.confirm} disabled={busy || !point || point.reliable === false} onClick={confirm}>
          {busy ? "Checking coverage..." : point?.reliable === false ? "Set a more accurate pin" : "Confirm this location"}
        </button>
      </footer>
    </section>
  );

  return (
    <>
      {!hideTrigger ? (
        <button
          type="button"
          className={`${styles.trigger} ${landing ? styles.triggerLanding : ""}`}
          onClick={() => setOpen(true)}
        >
          <IconMapPin size={17} />
          <span>{triggerLabel}</span>
        </button>
      ) : null}
      {pageMode
        ? dialog
        : open && typeof document !== "undefined"
          ? createPortal(
              <div
                className={styles.backdrop}
                role="presentation"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget) setOpen(false);
                }}
              >
                {dialog}
              </div>,
              document.body
            )
          : null}
    </>
  );
}
