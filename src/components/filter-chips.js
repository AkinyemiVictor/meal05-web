"use client";

const classNames = (...items) => items.filter(Boolean).join(" ");

export default function FilterChips({ filters = [], activeIndex = 0 }) {
  return (
    <div className="flex gap-3 overflow-x-auto px-5 py-5 [scrollbar-width:none] md:px-0 md:py-0">
      {filters.map((filter, index) => {
        const Icon = filter.icon;
        const active = index === activeIndex;
        return (
          <button
            key={filter.label}
            className={classNames(
              "flex h-12 shrink-0 items-center gap-2 rounded-full border px-5 text-sm font-medium shadow-sm",
              active
                ? "border-meal-pepper bg-meal-pepper text-meal-paper shadow-soft"
                : "border-meal-line bg-meal-paper text-meal-text"
            )}
            type="button"
          >
            {Icon ? <Icon size={18} stroke={1.8} /> : null}
            {filter.label}
          </button>
        );
      })}
    </div>
  );
}
