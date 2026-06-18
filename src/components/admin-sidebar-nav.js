"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BRAND_MARK_SRC } from "@/lib/theme-logo";

const SIDEBAR_WIDTH = 240;

const isExternal = (item) => item?.external === true;

export default function AdminSidebarNav({ navItems = [], userEmail = "" }) {
  const pathname = usePathname() || "";
  const [open, setOpen] = useState(false);
  const firstLinkRef = useRef(null);
  const sidebarRef = useRef(null);

  const orderedNav = useMemo(() => navItems, [navItems]);

  useEffect(() => {
    if (!open || !firstLinkRef.current) return;
    firstLinkRef.current.focus();
  }, [open]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("keydown", onKey);
    }
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const closeOnBlur = (event) => {
    if (!sidebarRef.current) return;
    if (!sidebarRef.current.contains(event.relatedTarget)) {
      setOpen(false);
    }
  };

  const activeHref = (href) => {
    if (!href) return false;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <>
      <aside
        ref={sidebarRef}
        className={`admin-sidebar ${open ? "open" : ""}`}
        onBlur={closeOnBlur}
        aria-label="Admin navigation"
      >
        <div className="admin-sidebar__header">
          <div className="admin-logo">
            <Image
              src={BRAND_MARK_SRC}
              alt="MealKit brand mark"
              className="admin-logo__img"
              width={38}
              height={38}
              sizes="38px"
              onError={(event) => {
                if (event?.currentTarget) {
                  event.currentTarget.style.display = "none";
                }
              }}
            />
            <div>
              <p className="admin-logo__eyebrow">MealKit</p>
              <strong className="admin-logo__title">Admin Workspace</strong>
            </div>
          </div>
        </div>
        <nav className="admin-sidebar__nav">
          {orderedNav.map((item, index) => {
            const active = activeHref(item.href);
            const content = (
              <span className="admin-sidebar__link-label">{item.label}</span>
            );
            const linkStyle = {
              textDecoration: "none",
              borderRadius: 10,
              padding: "10px 12px",
              display: "block",
              color: active ? "#0f172a" : "#e2e8f0",
              background: active ? "#e2e8f0" : "transparent",
              fontWeight: active ? 700 : 600,
              border: active ? "1px solid #e2e8f0" : "1px solid transparent",
            };

            if (isExternal(item)) {
              return (
                <a
                  key={item.href}
                  href={item.href}
                  style={linkStyle}
                  ref={index === 0 ? firstLinkRef : undefined}
                >
                  {content}
                </a>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                style={linkStyle}
                ref={index === 0 ? firstLinkRef : undefined}
                onClick={() => setOpen(false)}
              >
                {content}
              </Link>
            );
          })}
        </nav>
        <div className="admin-sidebar__footer">
          <p className="admin-sidebar__email" title={userEmail}>
            {userEmail || ""}
          </p>
        </div>
      </aside>

      <div className="admin-topbar">
        <button
          type="button"
          className="admin-hamburger"
          aria-label="Toggle navigation"
          aria-expanded={open}
          onClick={() => setOpen((state) => !state)}
        >
          ☰
        </button>
        <div className="admin-topbar__title">Admin Workspace</div>
        <div className="admin-topbar__email" title={userEmail}>
          {userEmail || ""}
        </div>
      </div>

      <div
        className={`admin-backdrop ${open ? "visible" : ""}`}
        onClick={() => setOpen(false)}
        aria-hidden={!open}
      />

      <style jsx global>{`
        :root {
          --admin-sidebar-width: ${SIDEBAR_WIDTH}px;
          --admin-topbar-height: 56px;
        }
        .admin-layout {
          display: flex;
          position: relative;
        }
        .admin-sidebar {
          position: fixed;
          top: 0;
          left: 0;
          bottom: 0;
          width: var(--admin-sidebar-width);
          background: #0f172a;
          color: #e2e8f0;
          border-right: 1px solid #1f2937;
          padding: 16px 14px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          transform: translateX(0);
          transition: transform 0.18s ease-in-out;
          z-index: 110;
        }
        .admin-sidebar__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .admin-logo {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .admin-logo__img {
          width: 38px;
          height: 38px;
          object-fit: contain;
          border-radius: 8px;
          background: #0b1220;
          padding: 4px;
        }
        .admin-logo__eyebrow {
          margin: 0;
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #94a3b8;
        }
        .admin-logo__title {
          font-size: 15px;
          color: #e2e8f0;
        }
        .admin-sidebar__nav {
          display: grid;
          gap: 8px;
          overflow-y: auto;
          padding-right: 4px;
        }
        .admin-sidebar__link-label {
          font-size: 13px;
          line-height: 1.3;
        }
        .admin-sidebar__footer {
          margin-top: auto;
          padding-top: 8px;
          border-top: 1px solid #1f2937;
        }
        .admin-sidebar__email {
          margin: 0;
          color: #cbd5e1;
          font-size: 12px;
          word-break: break-all;
        }
        .admin-topbar {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: var(--admin-topbar-height);
          display: none;
          align-items: center;
          justify-content: space-between;
          background: #0f172a;
          color: #e2e8f0;
          padding: 10px 12px;
          z-index: 120;
          border-bottom: 1px solid #1f2937;
        }
        .admin-hamburger {
          border: 1px solid #334155;
          border-radius: 8px;
          background: #111827;
          color: #e2e8f0;
          padding: 6px 10px;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
        }
        .admin-topbar__title {
          font-weight: 700;
          font-size: 14px;
          letter-spacing: 0.02em;
        }
        .admin-topbar__email {
          font-size: 12px;
          color: #cbd5e1;
          max-width: 40%;
          text-align: right;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .admin-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.45);
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.18s ease-in-out;
          z-index: 100;
        }
        .admin-backdrop.visible {
          opacity: 1;
          pointer-events: auto;
        }
        .admin-main {
          margin-left: var(--admin-sidebar-width);
          padding-top: 20px;
        }
        @media (max-width: 900px) {
          .admin-sidebar {
            transform: translateX(-100%);
          }
          .admin-sidebar.open {
            transform: translateX(0);
          }
          .admin-topbar {
            display: flex;
          }
          .admin-main {
            margin-left: 0;
            padding-top: calc(var(--admin-topbar-height) + 12px);
          }
        }
      `}</style>
    </>
  );
}
