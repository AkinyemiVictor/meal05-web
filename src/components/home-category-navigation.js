"use client";

import Link from "next/link";

const classNames = (...items) => items.filter(Boolean).join(" ");

function CategoryIcon({ icon, active = false, compact = false }) {
  return (
    <span
      aria-hidden="true"
      className={classNames(
        "inline-flex shrink-0 skew-x-[-8deg] items-center justify-center rounded-[14px] shadow-soft",
        compact ? "h-9 w-9 text-base" : "h-14 w-14 text-2xl",
        active ? "bg-meal-green text-meal-paper" : "bg-slate-900 text-meal-green"
      )}
    >
      <i
        className={classNames("fa-solid skew-x-[8deg]", icon)}
        style={{
          WebkitTextStroke: "1.6px currentColor",
          WebkitTextFillColor: "transparent",
        }}
      />
    </span>
  );
}

export function MobileCategories({ categories, activeCategory, counts }) {
  return (
    <section className="px-5 md:hidden">
      <div className="grid w-full grid-cols-4 gap-2 overflow-hidden">
        {categories.map((category) => {
          const active = activeCategory === category.slug;
          const count = counts[category.slug] ?? category.count ?? 0;
          return (
            <Link
              key={category.slug}
              href={`/categories/${category.slug}`}
              className={classNames(
                "min-w-0 overflow-hidden rounded-2xl border p-2 text-center shadow-sm transition",
                active ? "border-meal-pepper bg-meal-blush" : "border-meal-line bg-meal-paper"
              )}
            >
              <CategoryIcon icon={category.icon} active={active} />
              <p className="mt-2 truncate text-[11px] font-medium text-meal-text">{category.label}</p>
              <p className="text-[10px] font-medium text-meal-muted">{count} items</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function TabletCategoryTabs({ categories, activeCategory, counts }) {
  return (
    <nav className="sticky top-[145px] z-40 hidden border-b border-meal-line bg-meal-paper px-6 shadow-sm md:block lg:hidden">
      <div className="mx-auto flex max-w-[1440px] gap-2 overflow-x-auto py-3 [scrollbar-width:none]">
        {categories.map((category) => {
          const active = activeCategory === category.slug;
          const count = counts[category.slug] ?? category.count ?? 0;
          return (
            <Link
              key={category.slug}
              href={`/categories/${category.slug}`}
              className={classNames(
                "flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition",
                active
                  ? "border-meal-pepper bg-meal-pepper text-meal-paper"
                  : "border-meal-line bg-meal-paper text-meal-text"
              )}
            >
              <CategoryIcon icon={category.icon} active={active} compact />
              {category.label}
              <span className={classNames("text-xs", active ? "text-meal-paper/80" : "text-meal-muted")}>
                {count}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function DesktopCategorySidebar({ categories, activeCategory, counts, sidebarRef, style }) {
  return (
    <aside
      ref={sidebarRef}
      className="z-40 hidden w-64 overflow-y-auto border-r border-meal-line bg-meal-paper px-4 py-6 lg:block"
      style={style}
    >
      <p className="px-3 text-xs font-medium uppercase tracking-[0.18em] text-meal-muted">Categories</p>
      <div className="mt-4 space-y-1">
        {categories.map((category) => {
          const active = activeCategory === category.slug;
          const count = counts[category.slug] ?? category.count ?? 0;
          return (
            <Link
              key={category.slug}
              href={`/categories/${category.slug}`}
              className={classNames(
                "flex w-full min-w-0 items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-medium transition",
                active ? "bg-meal-blush text-meal-pepper" : "text-meal-text hover:bg-meal-mist"
              )}
            >
              <CategoryIcon icon={category.icon} active={active} compact />
              <span className="min-w-0 flex-1 truncate">{category.label}</span>
              <span className="rounded-full bg-meal-mist px-2 py-0.5 text-xs text-meal-muted">
                {count}
              </span>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
