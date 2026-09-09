const toFiniteNumber = (value) => {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export function startOfLagosBusinessDayIso(now = new Date()) {
  const lagosOffsetMs = 60 * 60 * 1000;
  const lagosNow = new Date(now.getTime() + lagosOffsetMs);
  lagosNow.setUTCHours(0, 0, 0, 0);
  return new Date(lagosNow.getTime() - lagosOffsetMs).toISOString();
}

export function summarizeGrossProductProfit(orders = []) {
  const lines = (Array.isArray(orders) ? orders : []).flatMap((order) =>
    Array.isArray(order?.order_items) ? order.order_items : []
  );

  if (!lines.length) {
    return {
      status: "no_sales",
      lineCount: 0,
      costedLineCount: 0,
      missingCostLineCount: 0,
      merchandiseRevenue: 0,
      supplierCost: 0,
      grossProfit: 0,
      marginPercent: null,
    };
  }

  let merchandiseRevenue = 0;
  let supplierCost = 0;
  let costedLineCount = 0;

  for (const line of lines) {
    const quantity = toFiniteNumber(line?.quantity);
    const sellingUnitPrice = toFiniteNumber(line?.price);
    const supplierUnitCost = toFiniteNumber(line?.supplier_unit_cost);

    if (quantity == null || quantity <= 0 || sellingUnitPrice == null || sellingUnitPrice < 0) {
      continue;
    }

    merchandiseRevenue += sellingUnitPrice * quantity;
    if (supplierUnitCost != null && supplierUnitCost >= 0) {
      supplierCost += supplierUnitCost * quantity;
      costedLineCount += 1;
    }
  }

  const missingCostLineCount = Math.max(0, lines.length - costedLineCount);
  if (missingCostLineCount > 0) {
    return {
      status: "incomplete",
      lineCount: lines.length,
      costedLineCount,
      missingCostLineCount,
      merchandiseRevenue,
      supplierCost,
      grossProfit: null,
      marginPercent: null,
    };
  }

  const grossProfit = merchandiseRevenue - supplierCost;
  return {
    status: "complete",
    lineCount: lines.length,
    costedLineCount,
    missingCostLineCount: 0,
    merchandiseRevenue,
    supplierCost,
    grossProfit,
    marginPercent: merchandiseRevenue > 0 ? (grossProfit / merchandiseRevenue) * 100 : 0,
  };
}
