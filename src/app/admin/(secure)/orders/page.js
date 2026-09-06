import Link from "next/link";
import {
  adminFormatters,
  loadOrderAdminDetail,
  loadOrderSupportOrderCatalogue,
} from "@/lib/admin-dashboard-data";
import AdminOrderStatusControl from "@/components/admin-order-status-control";
import AdminOrderSupportCaseControl from "@/components/admin-order-support-case-control";
import AdminOrderRiderAssignment from "@/components/admin-order-rider-assignment";
import { loadOrderDeliveryAssignment, loadRiderDirectory } from "@/lib/delivery/riders";
import styles from "./orders.module.css";

export const dynamic = "force-dynamic";

const ORDER_STATUS_FILTERS = [
  "all",
  "pending",
  "confirmed",
  "processing",
  "ready_for_dispatch",
  "dispatched",
  "delivered",
  "completed",
  "stock_failed",
  "payment_failed",
  "cancelled",
];

const toPositiveInt = (value, fallback) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 1 ? Math.floor(numeric) : fallback;
};

const textStatus = (value) =>
  String(value || "unknown")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());

const formatLineQuantity = (value) =>
  new Intl.NumberFormat("en-NG", { maximumFractionDigits: 3 }).format(Number(value) || 0);

const statusTone = (value) => {
  const normalized = String(value || "").toLowerCase();
  if (["confirmed", "paid", "delivered", "completed"].includes(normalized)) return styles.good;
  if (["rejected", "failed", "cancelled", "stock_failed", "payment_failed", "returned", "delayed"].includes(normalized)) return styles.bad;
  return styles.waiting;
};

function StatusPill({ value, prefix = "" }) {
  return <span className={`${styles.pill} ${statusTone(value)}`}>{prefix}{textStatus(value)}</span>;
}

const buildHref = (params, updates = {}) => {
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (key in updates || value == null || value === "") return;
    query.set(key, String(value));
  });
  Object.entries(updates).forEach(([key, value]) => {
    if (value == null || value === "" || value === "all") return;
    query.set(key, String(value));
  });
  const value = query.toString();
  return value ? `/admin/orders?${value}` : "/admin/orders";
};

function Pager({ params, page, totalPages }) {
  return (
    <nav className={styles.pager} aria-label="Order pages">
      <Link aria-disabled={page <= 1} href={buildHref(params, { page: Math.max(1, page - 1), orderId: "" })}>Previous</Link>
      <span>{page} / {totalPages}</span>
      <Link aria-disabled={page >= totalPages} href={buildHref(params, { page: Math.min(totalPages, page + 1), orderId: "" })}>Next</Link>
    </nav>
  );
}

function OrderCard({ order, active, href }) {
  return (
    <Link className={`${styles.orderCard} ${active ? styles.orderCardActive : ""}`} href={href}>
      <div className={styles.orderCardTop}>
        <div>
          <strong>Order #{order.id}</strong>
          <span>{adminFormatters.dateTime(order.createdAt)}</span>
        </div>
        <strong>{adminFormatters.currency(order.total)}</strong>
      </div>
      <p className={styles.customer}>{order.customer}</p>
      <div className={styles.cardPills}>
        <StatusPill value={order.status} />
        <StatusPill value={order.paymentStatus} prefix="Pay: " />
      </div>
      <div className={styles.orderCardBottom}>
        <span>{order.fulfillmentType === "pickup" ? "Pickup" : textStatus(order.deliveryStatus || "Delivery pending")}</span>
        {order.primaryException ? <b className={styles.attention}>Needs attention</b> : null}
        {order.openSupportCaseCount ? <b>{order.openSupportCaseCount} open case{order.openSupportCaseCount === 1 ? "" : "s"}</b> : null}
      </div>
    </Link>
  );
}

export default async function AdminOrdersPage({ searchParams }) {
  const params = (await searchParams) || {};
  const query = String(params.q || "").trim();
  const page = toPositiveInt(params.page, 1);
  const pageSize = Math.max(10, Math.min(50, toPositiveInt(params.pageSize, 20)));
  const status = ORDER_STATUS_FILTERS.includes(String(params.status || "all")) ? String(params.status || "all") : "all";
  const selectedOrderId = String(params.orderId || "").trim();

  // This route is nested under the secure admin layout, which authenticates and
  // authorizes the user before these server-only administrative reads execute.
  const [ordersData, selectedDetail] = await Promise.all([
    loadOrderSupportOrderCatalogue({ page, pageSize, query, status }),
    selectedOrderId
      ? loadOrderAdminDetail(selectedOrderId)
      : Promise.resolve({ order: null, items: [], supportCases: [], statusHistory: [], payment: null, warnings: [] }),
  ]);

  const needsDeliveryTools = Boolean(selectedDetail.order && selectedDetail.order.fulfillmentType !== "pickup");
  const [riderData, deliveryAssignment] = needsDeliveryTools
    ? await Promise.all([
        loadRiderDirectory({ activeOnly: true, includePhotos: false }),
        loadOrderDeliveryAssignment(selectedOrderId),
      ])
    : [{ riders: [], warning: "" }, null];

  const warnings = Array.from(new Set([...(ordersData.warnings || []), ...(selectedDetail.warnings || []), riderData.warning].filter(Boolean)));
  const totalPages = Math.max(1, Number(ordersData.totalPages || 1));
  const order = selectedDetail.order;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Operations</p>
          <h1>Orders</h1>
          <p>Move each paid order from preparation to delivery with one clear next step.</p>
        </div>
        <Link className={styles.supportLink} href="/admin/orders/support">Returns &amp; refunds</Link>
      </header>

      {warnings.length ? (
        <details className={styles.notice}>
          <summary>Some secondary order information is temporarily unavailable</summary>
          <ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </details>
      ) : null}

      <section className={styles.workspace}>
        <aside className={styles.listPane}>
          <div className={styles.listHeading}>
            <div>
              <strong>Order queue</strong>
              <span>{ordersData.totalCount} order{ordersData.totalCount === 1 ? "" : "s"}</span>
            </div>
          </div>

          <form className={styles.filters} method="GET">
            <input type="search" name="q" defaultValue={query} placeholder="Search order or customer" aria-label="Search orders" />
            <select name="status" defaultValue={status} aria-label="Workflow stage">
              {ORDER_STATUS_FILTERS.map((option) => (
                <option key={option} value={option}>{option === "all" ? "All workflow stages" : textStatus(option)}</option>
              ))}
            </select>
            <input type="hidden" name="pageSize" value={pageSize} />
            <button type="submit">Search</button>
          </form>

          <div className={styles.orderList}>
            {ordersData.records.map((row) => (
              <OrderCard key={row.id} order={row} active={String(row.id) === selectedOrderId} href={buildHref(params, { orderId: row.id })} />
            ))}
            {!ordersData.records.length ? <div className={styles.emptyList}>No orders match this view.</div> : null}
          </div>
          <Pager params={params} page={ordersData.page} totalPages={totalPages} />
        </aside>

        <section className={styles.detailPane}>
          {!selectedOrderId ? (
            <div className={styles.chooseOrder}>
              <span>→</span>
              <h2>Choose an order</h2>
              <p>Select an order from the queue to see its next action, items and delivery details.</p>
            </div>
          ) : !order ? (
            <div className={styles.chooseOrder}>
              <h2>Order not found</h2>
              <p>It may have been removed or is no longer available.</p>
              <Link href="/admin/orders">Return to the queue</Link>
            </div>
          ) : (
            <div className={styles.detailContent}>
              <div className={styles.detailHeader}>
                <div>
                  <Link href={buildHref(params, { orderId: "" })} className={styles.mobileBack}>← Order queue</Link>
                  <p>{order.fulfillmentType === "pickup" ? "Pickup order" : "Delivery order"}</p>
                  <h2>Order #{order.id}</h2>
                  <span>{order.orderReference || `Order #${order.id}`} · {order.customer} · {adminFormatters.dateTime(order.createdAt)}</span>
                </div>
                <strong>{adminFormatters.currency(order.total)}</strong>
              </div>

              <AdminOrderStatusControl
                orderId={order.id}
                currentStatus={order.status}
                currentPaymentStatus={order.paymentStatus}
                currentDeliveryStatus={order.deliveryStatus}
                fulfillmentType={order.fulfillmentType}
              />

              <section className={styles.coreSection}>
                <div className={styles.sectionTitle}>
                  <h3>Items</h3>
                  <span>{selectedDetail.items.length} line{selectedDetail.items.length === 1 ? "" : "s"}</span>
                </div>
                <div className={styles.items}>
                  {selectedDetail.items.map((item) => (
                    <article key={String(item.id)}>
                      <div className={styles.itemIdentity}>
                        <strong>{item.productName}</strong>
                        {item.variantName ? <span>Option: {item.variantName}</span> : null}
                        <span>Quantity ordered: {formatLineQuantity(item.quantity)}</span>
                        <span>Unit price: {adminFormatters.currency(item.unitPrice)}{item.unit ? ` · ${item.unit}` : ""}</span>
                        {item.sizePreferenceLabel ? (
                          <>
                            <small>Fulfilment size preference: {item.sizePreferenceLabel}</small>
                            <small>Preference guides physical piece size only; fulfil the paid quantity or value.</small>
                          </>
                        ) : null}
                        {item.fulfillmentNote ? <small>Note: {item.fulfillmentNote}</small> : null}
                      </div>
                      <b aria-label="Line total">{adminFormatters.currency(item.lineTotal)}</b>
                    </article>
                  ))}
                  {!selectedDetail.items.length ? <p className={styles.muted}>No items were found for this order.</p> : null}
                </div>
              </section>

              <section className={styles.coreSection}>
                <div className={styles.sectionTitle}><h3>{order.fulfillmentType === "pickup" ? "Collection" : "Delivery"}</h3></div>
                <p className={styles.address}>{order.deliveryAddress || (order.fulfillmentType === "pickup" ? "Pickup location is recorded in fulfilment details." : "No delivery address recorded.")}</p>
                {order.deliveryInstructions ? <p className={styles.muted}>Instructions: {order.deliveryInstructions}</p> : null}
                {order.customerNote ? <p className={styles.muted}>Customer note: {order.customerNote}</p> : null}
              </section>

              {needsDeliveryTools ? (
                <AdminOrderRiderAssignment order={order} riders={riderData.riders} assignment={deliveryAssignment} />
              ) : null}

              <details className={styles.detailsBlock}>
                <summary>Payment details &amp; order history</summary>
                <div className={styles.advancedContent}>
                  <section>
                    <div className={styles.sectionTitle}>
                      <h3>Payment</h3>
                      <Link href={`/admin/payments?purpose=order_payment&orderId=${encodeURIComponent(order.id)}`}>Open in Payments</Link>
                    </div>
                    <div className={styles.facts}>
                      <span>Status <strong>{textStatus(order.paymentStatus)}</strong></span>
                      <span>Method <strong>{textStatus(selectedDetail.payment?.provider || order.paymentMethod)}</strong></span>
                      <span>Reference <strong>{selectedDetail.payment?.reference || order.paymentReference || "Not recorded"}</strong></span>
                    </div>
                  </section>
                  <section>
                    <h3>Status history</h3>
                    {selectedDetail.statusHistory.length ? (
                      <ol className={styles.timeline}>
                        {selectedDetail.statusHistory.map((entry) => (
                          <li key={String(entry.id)}><strong>{textStatus(entry.toStatus)}</strong><span>{entry.changedAt ? adminFormatters.dateTime(entry.changedAt) : ""}{entry.note ? ` · ${entry.note}` : ""}</span></li>
                        ))}
                      </ol>
                    ) : <p className={styles.muted}>No status events recorded yet.</p>}
                  </section>
                </div>
              </details>

              <details className={styles.detailsBlock}>
                <summary>Support notes ({selectedDetail.supportCases.length})</summary>
                <div className={styles.advancedContent}>
                  {selectedDetail.supportCases.map((supportCase) => (
                    <article className={styles.supportCase} key={String(supportCase.id)}>
                      <div><StatusPill value={supportCase.caseStatusLabel} /><strong>{supportCase.caseTypeLabel}</strong></div>
                      <p>{supportCase.reason}</p>
                      {supportCase.adminNote ? <small>Admin: {supportCase.adminNote}</small> : null}
                    </article>
                  ))}
                  {!selectedDetail.supportCases.length ? <p className={styles.muted}>No support notes for this order.</p> : null}
                  <AdminOrderSupportCaseControl orderId={order.id} />
                </div>
              </details>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
