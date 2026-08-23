"use client";

const badgeBase = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  width: "fit-content",
  borderRadius: 999,
  padding: "5px 9px",
  fontSize: 12,
  fontWeight: 850,
  lineHeight: 1.2,
};

const dotBase = {
  width: 7,
  height: 7,
  borderRadius: 999,
  flex: "0 0 auto",
};

export function CartLineAvailabilityBadge({ requestOnly = false }) {
  const badgeStyle = requestOnly
    ? {
        ...badgeBase,
        border: "1px solid rgba(217, 119, 6, 0.28)",
        background: "#fffbeb",
        color: "#92400e",
      }
    : {
        ...badgeBase,
        border: "1px solid rgba(21, 128, 61, 0.2)",
        background: "#f0fdf4",
        color: "#166534",
      };
  const dotStyle = requestOnly
    ? { ...dotBase, background: "#d97706" }
    : { ...dotBase, background: "#16a34a" };

  return (
    <span style={badgeStyle} aria-label={requestOnly ? "Needs availability confirmation" : "Ready to order"}>
      <span style={dotStyle} aria-hidden="true" />
      {requestOnly ? "Needs confirmation" : "Ready to order"}
    </span>
  );
}

const panelStyle = {
  display: "grid",
  gap: 12,
  padding: 14,
  borderRadius: 14,
  border: "1px solid rgba(217, 119, 6, 0.24)",
  background: "#fffbeb",
  color: "#4b3621",
  fontSize: 14,
  lineHeight: 1.5,
};

const headingStyle = {
  margin: 0,
  color: "#78350f",
  fontSize: 15,
  fontWeight: 900,
};

const statusGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 8,
};

const statusCardStyle = {
  display: "grid",
  gap: 3,
  borderRadius: 11,
  padding: "9px 10px",
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(120, 53, 15, 0.1)",
};

export function CartAvailabilitySummary({ requestCount = 0, standardCount = 0 }) {
  const safeRequestCount = Math.max(0, Number(requestCount) || 0);
  const safeStandardCount = Math.max(0, Number(standardCount) || 0);

  if (!safeRequestCount) return null;

  return (
    <div style={panelStyle} role="note" aria-label="Basket availability confirmation">
      <div>
        <p style={headingStyle}>This basket needs availability confirmation</p>
        <p style={{ margin: "4px 0 0" }}>
          At least one item needs a quick market or supplier check before payment.
        </p>
      </div>

      <div style={statusGridStyle}>
        <div style={statusCardStyle}>
          <strong style={{ color: "#166534", fontSize: 13 }}>Ready to order</strong>
          <span>{safeStandardCount} product option{safeStandardCount === 1 ? "" : "s"}</span>
        </div>
        <div style={statusCardStyle}>
          <strong style={{ color: "#92400e", fontSize: 13 }}>Needs confirmation</strong>
          <span>{safeRequestCount} product option{safeRequestCount === 1 ? "" : "s"}</span>
        </div>
      </div>

      <p style={{ margin: 0 }}>
        For launch, Meal05 submits the full basket together. No payment is taken now. Once the requested items are confirmed, you can return and complete payment for the basket.
      </p>
      <p style={{ margin: 0, fontWeight: 800, color: "#78350f" }}>
        You do not need to keep this page open while we check.
      </p>
    </div>
  );
}
