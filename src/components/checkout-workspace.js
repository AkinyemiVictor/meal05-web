"use client";

import { useState } from "react";

import CheckoutForm from "@/components/checkout-form";
import CheckoutSummary from "@/components/checkout-summary";

export default function CheckoutWorkspace({
  deliverySettings,
  deliveryCity,
  dispatchOptionId,
  dispatchOptions,
  fulfillmentType,
  onFulfillmentChange,
  firstOrderDeliveryPromo = false,
  pickupLocations,
  pickupLocationId,
  onPickupLocationChange,
  onCityChange,
  onDispatchChange,
}) {
  const [isProcessing, setIsProcessing] = useState(false);

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
        onProcessingChange={setIsProcessing}
      />
      <CheckoutSummary
        deliverySettings={deliverySettings}
        deliveryCity={deliveryCity}
        selectedDispatchOptionId={dispatchOptionId}
        dispatchOptions={dispatchOptions}
        fulfillmentType={fulfillmentType}
        firstOrderDeliveryPromo={firstOrderDeliveryPromo}
        isProcessing={isProcessing}
        submitFormId="checkout-order-form"
      />
    </div>
  );
}
