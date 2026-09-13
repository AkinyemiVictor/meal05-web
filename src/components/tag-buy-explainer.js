"use client";

import { useId, useRef } from "react";
import { IconInfoCircle, IconX } from "@tabler/icons-react";

export default function TagBuyExplainer({ compact = false }) {
  const dialogRef = useRef(null);
  const titleId = useId();

  const open = () => dialogRef.current?.showModal();
  const close = () => dialogRef.current?.close();

  return (
    <>
      <button
        type="button"
        className={`tag-buy-explainer__trigger${compact ? " is-compact" : ""}`}
        onClick={open}
        aria-haspopup="dialog"
      >
        <IconInfoCircle size={16} stroke={1.9} aria-hidden="true" />
        Why are the prices different?
      </button>
      <dialog
        ref={dialogRef}
        className="tag-buy-explainer"
        aria-labelledby={titleId}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <div className="tag-buy-explainer__sheet">
          <div className="tag-buy-explainer__handle" aria-hidden="true" />
          <header>
            <div>
              <span className="tag-buy-explainer__eyebrow">Buy together. Pay less.</span>
              <h2 id={titleId}>How Tag Buy works</h2>
            </div>
            <button type="button" className="tag-buy-explainer__close" onClick={close} aria-label="Close Tag Buy explanation">
              <IconX size={20} stroke={1.8} aria-hidden="true" />
            </button>
          </header>
          <p>
            We combine orders for the same product until the displayed bulk target is reached. Buying more at once helps us share procurement costs and pass the lower price to you.
          </p>
          <div className="tag-buy-explainer__choice">
            <strong>Choose Tag Buy</strong>
            <span>Get the best price and wait until the round closes before sourcing begins.</span>
          </div>
          <div className="tag-buy-explainer__choice">
            <strong>Need it sooner?</strong>
            <span>Choose Buy now and we&apos;ll source your quantity separately at the displayed regular price.</span>
          </div>
          <p className="tag-buy-explainer__note">
            Your selected quantity stays the same. Only the price and fulfilment timing change.
          </p>
          <button type="button" className="tag-buy-explainer__done" onClick={close}>Got it</button>
        </div>
      </dialog>
    </>
  );
}
