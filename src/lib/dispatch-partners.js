export const DEFAULT_DISPATCH_OPTION_ID = "meal05-priority";

const roundMoney = (value, fallback = 0) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return Math.max(0, Math.round(fallback));
  return Math.max(0, Math.round(numeric));
};

const withComputedFee = (baseFee, option) => {
  const fee = roundMoney(baseFee + option.adjustment, baseFee);
  return {
    ...option,
    fee,
  };
};

export const getDispatchOptions = (baseFee = 0) => {
  const normalizedBaseFee = roundMoney(baseFee, 0);
  return [
    {
      id: "meal05-priority",
      name: "Meal05 Priority Dispatch",
      summary: "Best balance of price, speed, and delivery reliability.",
      eta: "Same day, 2-4 hours",
      adjustment: 0,
      recommended: true,
      reason: "Recommended",
    },
    {
      id: "swift-runner",
      name: "SwiftRunner Logistics",
      summary: "Fastest partner for urgent kitchen restocks.",
      eta: "Express, 1-2 hours",
      adjustment: 500,
      recommended: false,
      reason: "Fastest",
    },
    {
      id: "greenroute",
      name: "GreenRoute Couriers",
      summary: "Lower-cost dispatch for flexible delivery windows.",
      eta: "Standard, 4-6 hours",
      adjustment: -250,
      recommended: false,
      reason: "Best price",
    },
    {
      id: "caremove",
      name: "CareMove Dispatch",
      summary: "Careful handling for fragile produce and chilled items.",
      eta: "Same day, 3-5 hours",
      adjustment: 300,
      recommended: false,
      reason: "Care handling",
    },
  ].map((option) => withComputedFee(normalizedBaseFee, option));
};

export const resolveDispatchOption = (baseFee = 0, optionId = DEFAULT_DISPATCH_OPTION_ID) => {
  const options = getDispatchOptions(baseFee);
  return (
    options.find((option) => option.id === optionId) ||
    options.find((option) => option.recommended) ||
    options[0]
  );
};
