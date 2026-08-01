"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const PAGE_SIZE = 100;
const ROUNDING_OPTIONS = [1, 10, 50, 100];

const formatCurrency = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return "N/A";
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: Number.isInteger(number) ? 0 : 2,
  }).format(number);
};

const formatDateTime = (value) =>
  new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

const normalizePriceInput = (value) => {
  const text = String(value ?? "").replace(/,/g, "").trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
};

const samePrice = (left, right) => {
  const leftNumber = left == null || left === "" ? null : normalizePriceInput(left);
  const rightNumber = right == null || right === "" ? null : normalizePriceInput(right);
  return leftNumber === rightNumber;
};

const roundTo = (value, roundBy) => {
  const number = Number(value);
  const step = Number(roundBy) > 0 ? Number(roundBy) : 1;
  if (!Number.isFinite(number)) return value;
  return Math.max(step, Math.round(number / step) * step);
};

const buildDraftFromItem = (item) => ({
  price: item?.price == null ? "" : String(item.price),
  oldPrice: item?.oldPrice == null ? "" : String(item.oldPrice),
});

export default function AdminPriceEditor() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 });
  const [filters, setFilters] = useState({ search: "", category: "", active: "all", sort: "category", direction: "asc" });
  const [drafts, setDrafts] = useState({});
  const [selected, setSelected] = useState({});
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");
  const [bulkMode, setBulkMode] = useState("increase");
  const [bulkPercent, setBulkPercent] = useState("5");
  const [bulkRound, setBulkRound] = useState(10);

  const itemIndex = useMemo(() => new Map(items.map((item) => [String(item.variantId), item])), [items]);

  const changedIds = useMemo(
    () =>
      items
        .filter((item) => {
          const draft = drafts[item.variantId];
          if (!draft) return false;
          return !samePrice(draft.price, item.price) || !samePrice(draft.oldPrice, item.oldPrice);
        })
        .map((item) => String(item.variantId)),
    [drafts, items]
  );
  const changedSet = useMemo(() => new Set(changedIds), [changedIds]);
  const selectedIds = useMemo(() => Object.keys(selected).filter((id) => selected[id] && itemIndex.has(id)), [itemIndex, selected]);

  const loadRows = useCallback(async ({ page = pagination.page } = {}) => {
    setStatus("loading");
    setMessage("");
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
      sort: filters.sort,
      direction: filters.direction,
    });
    if (filters.search.trim()) params.set("search", filters.search.trim());
    if (filters.category) params.set("category", filters.category);
    if (filters.active !== "all") params.set("active", filters.active);

    try {
      const response = await fetch(`/api/admin/product-prices?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || `Load failed (${response.status})`);
      const nextItems = Array.isArray(payload?.items) ? payload.items : [];
      setItems(nextItems);
      setCategories(Array.isArray(payload?.categories) ? payload.categories : []);
      setPagination(payload?.pagination || { page, pageSize: PAGE_SIZE, total: nextItems.length, totalPages: 1 });
      setDrafts((current) => {
        const next = { ...current };
        nextItems.forEach((item) => {
          if (!next[item.variantId]) next[item.variantId] = buildDraftFromItem(item);
        });
        return next;
      });
      setStatus("ready");
    } catch (error) {
      setStatus("error");
      setMessage(error?.message || "Unable to load prices.");
    }
  }, [filters.active, filters.category, filters.direction, filters.search, filters.sort, pagination.page]);

  useEffect(() => {
    const timeout = window.setTimeout(() => loadRows({ page: 1 }), 250);
    return () => window.clearTimeout(timeout);
  }, [filters.active, filters.category, filters.direction, filters.search, filters.sort, loadRows]);

  useEffect(() => {
    const handler = (event) => {
      if (!changedIds.length) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [changedIds.length]);

  const updateDraft = (variantId, field, value) => {
    setDrafts((current) => ({
      ...current,
      [variantId]: {
        ...(current[variantId] || buildDraftFromItem(itemIndex.get(String(variantId)))),
        [field]: value,
      },
    }));
  };

  const resetIds = (ids) => {
    setDrafts((current) => {
      const next = { ...current };
      ids.forEach((id) => {
        const item = itemIndex.get(String(id));
        if (item) next[id] = buildDraftFromItem(item);
      });
      return next;
    });
    setMessage("");
  };

  const buildUpdates = (ids) =>
    ids
      .map((id) => {
        const item = itemIndex.get(String(id));
        const draft = drafts[id];
        if (!item || !draft) return null;
        if (!changedSet.has(String(id))) return null;
        const price = normalizePriceInput(draft.price);
        const oldPrice = normalizePriceInput(draft.oldPrice);
        if (price == null || price <= 0) {
          throw new Error(`${item.productName} ${item.variantName}: enter a positive current price.`);
        }
        if (oldPrice != null && oldPrice < price) {
          throw new Error(`${item.productName} ${item.variantName}: old price cannot be lower than current price.`);
        }
        return { variantId: item.variantId, price, oldPrice };
      })
      .filter(Boolean);

  const saveIds = async (ids) => {
    setStatus("saving");
    setMessage("");
    try {
      const updates = buildUpdates(ids);
      if (!updates.length) {
        setStatus("ready");
        setMessage("No changes to save.");
        return;
      }
      const response = await fetch("/api/admin/product-prices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Unable to save product prices.");
      const updatedItems = Array.isArray(payload?.items) ? payload.items : [];
      setItems((current) =>
        current.map((item) => updatedItems.find((updated) => String(updated.variantId) === String(item.variantId)) || item)
      );
      setDrafts((current) => {
        const next = { ...current };
        updatedItems.forEach((item) => {
          next[item.variantId] = buildDraftFromItem(item);
        });
        return next;
      });
      setSelected({});
      setStatus("ready");
      setMessage(`Saved ${updates.length} ${updates.length === 1 ? "price" : "prices"} at ${formatDateTime(Date.now())}.`);
    } catch (error) {
      setStatus("ready");
      setMessage(error?.message || "Unable to save product prices.");
    }
  };

  const applyBulkPreview = () => {
    const ids = selectedIds.length ? selectedIds : items.map((item) => String(item.variantId));
    const percent = Number(bulkPercent);
    if (!ids.length || !Number.isFinite(percent) || percent <= 0) {
      setMessage("Select rows and enter a positive percentage.");
      return;
    }
    const direction = bulkMode === "reduce" ? -1 : 1;
    setDrafts((current) => {
      const next = { ...current };
      ids.forEach((id) => {
        const item = itemIndex.get(String(id));
        if (!item) return;
        const draft = next[id] || buildDraftFromItem(item);
        const basePrice = normalizePriceInput(draft.price) ?? Number(item.price);
        const nextPrice = roundTo(basePrice * (1 + direction * (percent / 100)), bulkRound);
        next[id] = {
          ...draft,
          price: String(nextPrice),
        };
      });
      return next;
    });
    setMessage(`Preview applied to ${ids.length} ${ids.length === 1 ? "row" : "rows"}. Review before saving.`);
  };

  const allVisibleSelected = items.length > 0 && items.every((item) => selected[String(item.variantId)]);
  const toggleAllVisible = () => {
    setSelected((current) => {
      const next = { ...current };
      items.forEach((item) => {
        if (allVisibleSelected) delete next[String(item.variantId)];
        else next[String(item.variantId)] = true;
      });
      return next;
    });
  };

  return (
    <main className="admin-price-page">
      <header className="admin-price-page__header">
        <div>
          <p>Admin</p>
          <h1>Price Manager</h1>
        </div>
        <button type="button" onClick={() => loadRows()} disabled={status === "loading" || status === "saving"}>
          Refresh
        </button>
      </header>

      <section className="admin-price-toolbar" aria-label="Price filters">
        <label>
          <span>Search</span>
          <input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} />
        </label>
        <label>
          <span>Category</span>
          <select value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}>
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Status</span>
          <select value={filters.active} onChange={(event) => setFilters((current) => ({ ...current, active: event.target.value }))}>
            <option value="all">All</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </label>
        <label>
          <span>Sort</span>
          <select value={filters.sort} onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value }))}>
            <option value="category">Category</option>
            <option value="product">Product</option>
            <option value="variant">Variant</option>
          </select>
        </label>
      </section>

      <section className="admin-price-bulk" aria-label="Bulk price tools">
        <select value={bulkMode} onChange={(event) => setBulkMode(event.target.value)} aria-label="Bulk mode">
          <option value="increase">Increase</option>
          <option value="reduce">Reduce</option>
        </select>
        <input
          value={bulkPercent}
          onChange={(event) => setBulkPercent(event.target.value)}
          inputMode="decimal"
          aria-label="Bulk percentage"
        />
        <span>%</span>
        <select value={bulkRound} onChange={(event) => setBulkRound(Number(event.target.value))} aria-label="Round prices">
          {ROUNDING_OPTIONS.map((value) => (
            <option key={value} value={value}>
              Round {formatCurrency(value)}
            </option>
          ))}
        </select>
        <button type="button" onClick={applyBulkPreview}>Preview</button>
        <button type="button" onClick={() => saveIds(selectedIds)} disabled={!selectedIds.some((id) => changedSet.has(id)) || status === "saving"}>
          Save selected
        </button>
        <button type="button" onClick={() => saveIds(changedIds)} disabled={!changedIds.length || status === "saving"}>
          Save all changes
        </button>
        <button type="button" onClick={() => resetIds(changedIds)} disabled={!changedIds.length || status === "saving"}>
          Reset
        </button>
      </section>

      <div className="admin-price-status" role={message ? "alert" : "status"}>
        <span>{status === "loading" ? "Loading prices..." : `${pagination.total.toLocaleString("en-NG")} variants`}</span>
        <span>{changedIds.length ? `${changedIds.length} unsaved` : "Saved"}</span>
        {message ? <strong>{message}</strong> : null}
      </div>

      <section className="admin-price-table-wrap" aria-label="Product price spreadsheet">
        <table className="admin-price-table">
          <thead>
            <tr>
              <th>
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} aria-label="Select visible rows" />
              </th>
              <th>Category</th>
              <th>Product</th>
              <th>Variant</th>
              <th>Stock</th>
              <th>Current price</th>
              <th>Old price</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const id = String(item.variantId);
              const draft = drafts[id] || buildDraftFromItem(item);
              const changed = changedSet.has(id);
              return (
                <tr key={id} className={changed ? "is-changed" : ""}>
                  <td>
                    <input
                      type="checkbox"
                      checked={Boolean(selected[id])}
                      onChange={(event) =>
                        setSelected((current) => ({ ...current, [id]: event.target.checked }))
                      }
                      aria-label={`Select ${item.productName} ${item.variantName}`}
                    />
                  </td>
                  <td>{item.categoryName}</td>
                  <td>
                    <strong>{item.productName}</strong>
                    {!item.isActive ? <span className="admin-price-pill">Inactive</span> : null}
                  </td>
                  <td>{item.variantName || item.unit || "Default"}</td>
                  <td>{item.stockCount == null ? "N/A" : item.stockCount.toLocaleString("en-NG")}</td>
                  <td>
                    <input
                      value={draft.price}
                      inputMode="decimal"
                      onChange={(event) => updateDraft(id, "price", event.target.value)}
                      aria-label={`Current price for ${item.productName} ${item.variantName}`}
                    />
                    <span>{formatCurrency(item.price)}</span>
                  </td>
                  <td>
                    <input
                      value={draft.oldPrice}
                      inputMode="decimal"
                      placeholder="None"
                      onChange={(event) => updateDraft(id, "oldPrice", event.target.value)}
                      aria-label={`Old price for ${item.productName} ${item.variantName}`}
                    />
                    <span>{item.oldPrice == null ? "No old price" : formatCurrency(item.oldPrice)}</span>
                  </td>
                  <td>
                    <button type="button" onClick={() => saveIds([id])} disabled={!changed || status === "saving"}>
                      Save
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {status === "error" ? <p className="admin-price-empty">{message || "Unable to load product prices."}</p> : null}
        {status !== "loading" && !items.length ? <p className="admin-price-empty">No products match these filters.</p> : null}
      </section>

      <footer className="admin-price-pagination">
        <button type="button" disabled={pagination.page <= 1 || status === "loading"} onClick={() => loadRows({ page: pagination.page - 1 })}>
          Previous
        </button>
        <span>
          Page {pagination.page} of {pagination.totalPages}
        </span>
        <button
          type="button"
          disabled={pagination.page >= pagination.totalPages || status === "loading"}
          onClick={() => loadRows({ page: pagination.page + 1 })}
        >
          Next
        </button>
      </footer>
    </main>
  );
}
