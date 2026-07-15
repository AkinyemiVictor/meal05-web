"use client";

import CheckoutForm from "@/components/checkout-form";
import CheckoutSummary from "@/components/checkout-summary";

export default function CheckoutWorkspace({
  deliverySettings,
  deliveryCity,
  dispatchOptionId,
  dispatchOptions,
  fulfillmentType,
  onFulfillmentChange,
  pickupLocations,
  pickupLocationId,
  onPickupLocationChange,
  onCityChange,
  onDispatchChange,
}) {
  return (
    <div className="checkout-grid">
      <CheckoutForm
        deliverySettings={deliverySettings}
        selectedDispatchOptionId={dispatchOptionId}
        dispatchOptions={dispatchOptions}
        fulfillmentType={fulfillmentType}
        onFulfillmentChange={onFulfillmentChange}
        pickupLocations={pickupLocations}
        pickupLocationId={pickupLocationId}
        onPickupLocationChange={onPickupLocationChange}
        onCityChange={onCityChange}
        onDispatchChange={onDispatchChange}
      />
      <CheckoutSummary
        deliverySettings={deliverySettings}
        deliveryCity={deliveryCity}
        selectedDispatchOptionId={dispatchOptionId}
        dispatchOptions={dispatchOptions}
        fulfillmentType={fulfillmentType}
        submitFormId="checkout-order-form"
      />
    </div>
  );
}
