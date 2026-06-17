"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

const NoticeContext = createContext({
  showNotice: () => {},
  hideNotice: () => {},
});

export const useNotice = () => useContext(NoticeContext);

export default function NoticeProvider({ children }) {
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState({ title: "", message: "", tone: "info", actions: null, autoClose: false, autoCloseMs: 4000 });
  const resolverRef = useRef(null);
  const timerRef = useRef(null);

  const hideNotice = useCallback((result) => {
    setOpen(false);
    const r = resolverRef.current; resolverRef.current = null;
    if (r) r(result);
  }, []);

  const showNotice = useCallback((opts = {}) => {
    const next = {
      title: opts.title || (opts.tone === "error" ? "Something went wrong" : "Notice"),
      message: String(opts.message || "").trim(),
      tone: opts.tone || "info",
      actions: Array.isArray(opts.actions) && opts.actions.length ? opts.actions : null,
      dismissText: opts.dismissText || "Close",
      autoClose: opts.autoClose ?? (opts.tone !== "error"),
      autoCloseMs: Number.isFinite(opts.autoCloseMs) ? opts.autoCloseMs : 4000,
    };
    setPayload(next);
    setOpen(true);
    return new Promise((resolve) => { resolverRef.current = resolve; });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") hideNotice(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, hideNotice]);

  useEffect(() => {
    if (!open) return undefined;
    if (!payload.autoClose) return undefined;
    timerRef.current && clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => hideNotice("timeout"), payload.autoCloseMs || 4000);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [open, payload.autoClose, payload.autoCloseMs, hideNotice]);

  const ctx = useMemo(() => ({ showNotice, hideNotice }), [showNotice, hideNotice]);

  const toneIcon = payload.tone === "success" ? "fa-circle-check" : payload.tone === "error" ? "fa-triangle-exclamation" : "fa-circle-info";

  return (
    <NoticeContext.Provider value={ctx}>
      {children}
      {open ? (
        <div className="notice-overlay" role="dialog" aria-modal="true" aria-labelledby="notice-title">
          <button type="button" className="notice-overlay-backdrop" aria-hidden="true" onClick={() => hideNotice(false)} />
          <div className={`notice-card notice-${payload.tone}`} role="document">
            <div className="notice-header">
              <i className={`fa-solid ${toneIcon}`} aria-hidden="true" />
              <h3 id="notice-title">{payload.title}</h3>
            </div>
            {payload.message ? <p className="notice-message">{payload.message}</p> : null}
            <div className="notice-actions">
              {payload.actions?.map((action, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={`notice-btn ${action.variant === "primary" ? "notice-btn--primary" : ""}`.trim()}
                  onClick={() => {
                    try { action.onClick?.(); } finally { hideNotice(action.value ?? true); }
                  }}
                >
                  {action.label || "OK"}
                </button>
              ))}
              <button type="button" className="notice-btn" onClick={() => hideNotice(false)}>
                {payload.dismissText || "Close"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </NoticeContext.Provider>
  );
}
