export function formatNaira(value) {
  try {
    return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(
      Number(value) || 0
    );
  } catch {
    const n = Math.round(Number(value) || 0).toLocaleString();
    return `₦${n}`;
  }
}

export function renderReceiptHtml(order, options = {}) {
  const brandGreen = "#00ac11";
  const dark = "#0f172a";
  const muted = "#475569";
  const baseUrl = options.baseUrl || process.env.APP_BASE_URL || "";
  const logoPath = options.logoPath || "/assets/logo/MEAL05%20NEW%20ICON%20LOGO-05.png";
  const logoUrl = baseUrl ? `${baseUrl.replace(/\/$/, "")}${logoPath}` :
    (options.logoUrl || process.env.APP_LOGO_URL || "https://www.meal05.com.ng/assets/logo/MEAL05%20NEW%20ICON%20LOGO-05.png");

  const items = Array.isArray(order?.items) ? order.items : [];
  const summary = order?.summary || { subtotal: 0, deliveryFee: 0, total: 0 };
  const createdAt = order?.createdAt ? new Date(order.createdAt) : new Date();
  const method = order?.paymentMethod ? String(order.paymentMethod) : "card";

  const rows = items
    .map((it) => {
      const qty = Number(it?.quantity ?? it?.orderCount ?? it?.orderSize ?? 1) || 1;
      const unit = it?.unit ? ` ${it.unit}` : "";
      const price = Number(it?.price) || 0;
      const subtotal = Math.round(price * qty);
      return `
        <tr>
          <td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;color:${dark}">${escapeHtml(it?.name ?? "Item")}</td>
          <td style="padding:10px 8px;text-align:center;border-bottom:1px solid #e2e8f0;color:${dark}">${qty}${unit}</td>
          <td style="padding:10px 8px;text-align:right;border-bottom:1px solid #e2e8f0;color:${dark}">${formatNaira(price)}</td>
          <td style="padding:10px 8px;text-align:right;border-bottom:1px solid #e2e8f0;color:${dark}">${formatNaira(subtotal)}</td>
        </tr>`;
    })
    .join("");

  const discount = Number(summary?.discount) || 0;

  return `
  <!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Meal05 Receipt ${escapeHtml(order?.orderId || "")}</title>
    </head>
    <body style="margin:0;background:#f4f7f6;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${dark}">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7f6;padding:24px 12px">
        <tr>
          <td align="center">
            <table role="presentation" width="700" cellspacing="0" cellpadding="0" style="max-width:700px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden">
              <tr>
                <td style="padding:24px 28px;border-bottom:1px dashed #e2e8f0">
                  <div style="display:flex;align-items:center;justify-content:space-between">
                    <div style="display:flex;align-items:center;gap:12px">
                      <img alt="Meal05" src="${logoUrl}" width="40" height="40" style="border-radius:50%;object-fit:cover" />
                      <div>
                        <div style="font-weight:800;color:${brandGreen};font-size:20px;line-height:1">Meal05</div>
                        <div style="font-size:12px;color:${muted};line-height:1.4">Real Meal, Real Fast</div>
                      </div>
                    </div>
                    <div style="text-align:right;font-size:12px;color:${muted}">
                      <div style="font-weight:700;color:${dark}">Purchase Receipt</div>
                      <div>Receipt No.: ${escapeHtml(order?.orderId || "-")}</div>
                    </div>
                  </div>
                  <div style="text-align:center;margin-top:18px">
                    <div style="font-size:28px;font-weight:800;color:${brandGreen}">${formatNaira(summary?.total)}</div>
                    <div style="margin-top:4px;color:${muted}">Successful Payment</div>
                    <div style="margin-top:2px;color:${muted};font-size:12px">${createdAt.toLocaleTimeString([], {
                      hour: '2-digit', minute: '2-digit'
                    })}, ${createdAt.toLocaleDateString()}</div>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding:22px 28px">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td style="padding:6px 0;color:${muted}">Payment Method: <strong style="color:${dark}">${escapeHtml(capitalise(method))}</strong></td>
                    </tr>
                    <tr>
                      <td style="padding:6px 0;color:${muted}">Customer Name: <strong style="color:${dark}">${escapeHtml(order?.fullName || order?.user?.name || 'Valued Customer')}</strong></td>
                    </tr>
                    <tr>
                      <td style="padding:6px 0;color:${muted}">Delivery Address: <strong style="color:${dark}">${escapeHtml(order?.address || order?.user?.address || '-')}</strong></td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:0 28px 22px">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0">
                    <thead>
                      <tr>
                        <th align="left" style="padding:12px 8px;color:${dark};text-align:left">Item</th>
                        <th align="center" style="padding:12px 8px;color:${dark};text-align:center">Qty</th>
                        <th align="right" style="padding:12px 8px;color:${dark};text-align:right">Price (₦)</th>
                        <th align="right" style="padding:12px 8px;color:${dark};text-align:right">Subtotal (₦)</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${rows}
                    </tbody>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:22px 28px">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td style="width:70%"></td>
                      <td style="width:30%">
                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px;color:${dark}">
                          <tr><td style="padding:6px 0;color:${muted}">Subtotal:</td><td align="right">${formatNaira(summary?.subtotal)}</td></tr>
                          <tr><td style="padding:6px 0;color:${muted}">Delivery Fee:</td><td align="right">${summary?.deliveryFee === 0 ? 'Free' : formatNaira(summary?.deliveryFee)}</td></tr>
                          ${discount ? `<tr><td style="padding:6px 0;color:${muted}">Discount:</td><td align="right">-${formatNaira(discount)}</td></tr>` : ''}
                          <tr><td style="padding:8px 0;border-top:1px solid #e2e8f0"><strong>Total Paid:</strong></td><td align="right" style="border-top:1px solid #e2e8f0"><strong>${formatNaira(summary?.total)}</strong></td></tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:18px 28px;border-top:1px dashed #e2e8f0;color:${muted};font-size:12px;text-align:center">
                  <p style="margin:6px 0">Thank you for shopping with Meal05 | Real Meal, Real Fast.</p>
                  <p style="margin:6px 0">Questions or returns? Contact support@meal05.ng within 6 hours of delivery.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`;
}

function escapeHtml(input) {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function capitalise(value) {
  const s = String(value || "").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
