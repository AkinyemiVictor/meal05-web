"use client";

import Link from "next/link";
import { IconCurrentLocation, IconMapPin, IconSearch, IconX } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LOCATION_EVENT, persistLocationPreference, readStoredLocationPreference, requestCurrentLocationPreference } from "@/lib/location-preferences";
import styles from "./location-picker.module.css";

const HUB = { lat: 7.342134, lng: 3.847802 };
const geocode = async (body) => {
  const response = await fetch("/api/location/geocode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Address search failed.");
  return data.results || [];
};

export default function LocationPicker({ landing = false, autoOpen = false, hideTrigger = false }) {
  const [open, setOpen] = useState(false); const [preference, setPreference] = useState(null);
  const [areas, setAreas] = useState([]); const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(""); const [serviceable, setServiceable] = useState(null);
  const [address, setAddress] = useState(""); const [point, setPoint] = useState(null);
  const mapNode = useRef(null); const map = useRef(null); const marker = useRef(null);

  useEffect(() => { const sync = event => setPreference(event?.detail?.preference ?? readStoredLocationPreference()); sync(); window.addEventListener(LOCATION_EVENT, sync); return () => window.removeEventListener(LOCATION_EVENT, sync); }, []);
  useEffect(() => { if (autoOpen && !readStoredLocationPreference()) setOpen(true); }, [autoOpen]);
  useEffect(() => { if (open) fetch("/api/location/serviceability").then(response => response.json()).then(data => setAreas((data.areas || []).slice(0, 8))).catch(() => {}); }, [open]);
  useEffect(() => {
    if (!open || !mapNode.current) return;
    let cancelled = false;
    import("leaflet").then(module => {
      if (cancelled || !mapNode.current) return;
      const L = module.default || module;
      map.current = L.map(mapNode.current, { center: HUB, zoom: 13 });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map.current);
      const icon = L.divIcon({ className: "meal05-map-pin", html: '<span aria-hidden="true">●</span>', iconSize: [30, 30], iconAnchor: [15, 15] });
      marker.current = L.marker(HUB, { draggable: true, icon }).addTo(map.current);
      marker.current.on("dragend", () => selectPoint(marker.current.getLatLng(), "openstreetmap", true));
      map.current.on("click", event => selectPoint(event.latlng, "openstreetmap", true));
    }).catch(() => setMessage("The map could not load. You can still use device GPS."));
    return () => { cancelled = true; map.current?.remove(); map.current = null; marker.current = null; };
  }, [open]);

  const selectPoint = async (location, provider = "openstreetmap", reverse = false) => {
    const latitude = Number(location.lat); const longitude = Number(location.lng);
    setPoint({ latitude, longitude, provider }); setServiceable(null);
    marker.current?.setLatLng([latitude, longitude]); map.current?.panTo([latitude, longitude]);
    if (reverse) { try { const [result] = await geocode({ mode: "reverse", latitude, longitude }); if (result?.label) setAddress(result.label); } catch {} }
  };
  const useGps = async () => { setBusy(true); setMessage(""); try { const gps = await requestCurrentLocationPreference(); await selectPoint({ lat: gps.coords.latitude, lng: gps.coords.longitude }, "device", true); } catch (error) { setMessage(error.message); } finally { setBusy(false); } };
  const searchAddress = async (requestedAddress = "") => {
    const query = typeof requestedAddress === "string" && requestedAddress ? requestedAddress : address; if (!query.trim()) return;
    setBusy(true); setMessage("");
    try { const [result] = await geocode({ mode: "search", query }); if (!result) throw new Error("We could not find that place. Try a nearby estate or landmark, then move the pin."); setAddress(result.label || query); await selectPoint({ lat: result.latitude, lng: result.longitude }, "photon"); }
    catch (error) { setMessage(error.message); } finally { setBusy(false); }
  };
  const confirm = async () => {
    if (!point) { setMessage("Use GPS, search for an area, or place the map pin first."); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/location/serviceability", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...point, formattedAddress: address, provider: point.provider }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Location check failed."); setServiceable(data.serviceable);
      if (data.serviceable) { const next = { type: "resolved", label: address || data.zone.name, line: address, city: "Ibadan", coords: data.coordinates, zone: data.zone, serviceable: true, provider: data.provider, timestamp: Date.now() }; persistLocationPreference(next); setPreference(next); setMessage(`Delivery is available here (${data.zone.name}).`); setTimeout(() => setOpen(false), 650); }
      else setMessage("We are not delivering to this exact location yet. Join the waitlist and we will notify you when we expand.");
    } catch (error) { setMessage(error.message); setServiceable(false); } finally { setBusy(false); }
  };
  const label = preference?.serviceable ? (preference.line || preference.zone?.name) : "Select location";
  return <>
    {!hideTrigger && <button type="button" className={`${styles.trigger} ${landing ? styles.triggerLanding : ""}`} onClick={() => setOpen(true)}><IconMapPin size={17}/><span>{label?.length > 24 ? `${label.slice(0, 24)}…` : label}</span></button>}
    {open && typeof document !== "undefined" && createPortal(<div className={styles.backdrop} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}><section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="location-title">
      <header className={styles.head}>
        <span className={styles.headIcon}><IconMapPin size={22}/></span>
        <div><span className={styles.eyebrow}>Delivery coverage</span><h2 id="location-title">Where should we deliver?</h2><p>Choose your location, then place the pin at your exact entrance.</p></div>
        <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Close location picker"><IconX size={20}/></button>
      </header>
      <div className={styles.body}>
        <div className={styles.controls}>
          <button type="button" className={styles.gps} disabled={busy} onClick={useGps}><span><IconCurrentLocation size={21}/></span><div><strong>{busy ? "Finding your location…" : "Use my current location"}</strong><small>Allow GPS for the fastest setup</small></div></button>
          <div className={styles.or}><span>or search manually</span></div>
          <label className={styles.searchLabel}><span>Area, estate or landmark</span><div className={styles.search}><IconSearch size={18}/><input value={address} onChange={event => setAddress(event.target.value)} onKeyDown={event => { if (event.key === "Enter") searchAddress(); }} placeholder="e.g. Elebu or Oluyole Estate"/><button type="button" onClick={() => searchAddress()} disabled={busy}>Search</button></div></label>
          <div className={styles.popular}><span>Popular nearby areas</span><div className={styles.areas}>{areas.map(area => <button type="button" key={area.id} onClick={() => { setAddress(area.name); searchAddress(area.name); }}>{area.name}</button>)}</div></div>
          <div className={`${styles.selection} ${point ? styles.selectionActive : ""}`}><IconMapPin size={18}/><div><small>{point ? "Selected location" : "No pin selected yet"}</small><strong>{point ? (address || `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`) : "Search, use GPS, or tap the map"}</strong></div></div>
        </div>
        <div className={styles.mapPanel}><div className={styles.mapTop}><span><b>Set the exact pin</b><small>The pin determines delivery eligibility</small></span>{point && <em>Pin selected</em>}</div><div ref={mapNode} className={styles.map}/><p className={styles.hint}><IconMapPin size={15}/> Tap the map or drag the green pin to your building entrance.</p></div>
      </div>
      {message && <div className={`${styles.result} ${serviceable ? styles.success : ""}`}>{message}{serviceable === false && <><br/><Link className={styles.waitlist} href="/#waitlist" onClick={() => setOpen(false)}>Join the delivery-area waitlist →</Link></>}</div>}
      <footer className={styles.footer}><p><b>5 km launch zone</b><span>Exact coverage is checked securely before checkout.</span></p><button type="button" className={styles.confirm} disabled={busy || !point} onClick={confirm}>{busy ? "Checking coverage…" : "Confirm this location"}</button></footer>
    </section></div>, document.body)}
  </>;
}
