# Meal05 order and payment state machine

This document records the canonical database values enforced by
`20260826090620_harden_checkout_manual_payments.sql`.

## Order fulfilment (`orders.status`)

- `pending` — order exists; fulfilment has not started.
- `confirmed` — legacy/administrative confirmation state.
- `processing` — confirmed payment has started fulfilment.
- `ready_for_dispatch`, `dispatched`, `shipped`, `delivered`, `completed` — fulfilment progression.
- `stock_failed`, `payment_failed` — recoverable operational failure states.
- `cancelled` — terminal cancellation.

## Order payment (`orders.payment_status`)

- `unpaid`, `pending` — legacy/gateway pre-confirmation states.
- `awaiting_payment` — the customer may start or retry payment.
- `awaiting_confirmation` — a transfer was submitted but is not paid yet.
- `confirmed`, `paid` — confirmed payment states. New payment finalizers use `paid`.
- `rejected` — legacy compatibility only; new manual-transfer rejection returns the order to `awaiting_payment`.
- `processing` — gateway transitional state.
- `failed` — payment attempt failed.
- `refunded` — confirmed payment was refunded.

`payment_verified = true` is only valid with `paid` or legacy `confirmed`.

## Payment attempt (`payments.status`)

- `pending` — legacy/general initialization state.
- `awaiting_transfer` — transfer instructions were issued.
- `submitted` — the customer supplied reconciliation details before expiry; this is not payment success.
- `processing` — gateway transitional state.
- `verified` — manual transfer confirmed by Meal05.
- `success` — wallet/Paystack finalizer success.
- `successful` — retained legacy spelling.
- `failed`, `cancelled`, `rejected`, `expired` — terminal unsuccessful attempt states.
- `reversed`, `refunded` — post-success reversal/refund states.

Manual transfer progression is:

`awaiting_transfer -> submitted -> verified`

An unsubmitted expired attempt moves to `expired`; its order returns to
`awaiting_payment`. A submitted-before-expiry attempt remains reviewable after
the expiry timestamp. Rejection preserves the payment attempt as `rejected`
and returns an unpaid, non-cancelled order to `awaiting_payment` so a new
payment reference can be created.

Wallet and Paystack finalizers remain atomic and server-verified. Stock is
deducted only by confirmed-payment finalizers, never by transfer submission.
