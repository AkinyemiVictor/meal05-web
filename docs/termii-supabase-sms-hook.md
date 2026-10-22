# Termii SMS via Supabase Send SMS Hook

This migration replaces Twilio only as the SMS transport. Supabase Auth remains responsible for generating, expiring, and verifying the OTP.

## Target flow

1. Customer requests a phone OTP in Meal05.
2. Supabase Auth generates the six-digit OTP.
3. Supabase invokes the Send SMS HTTP Hook using Standard Webhooks signatures.
4. `send-sms-termii` verifies the hook signature.
5. The function forwards a one-segment transactional SMS to Termii.
6. Customer enters the OTP in Meal05.
7. Supabase Auth verifies the OTP exactly as before.

The existing frontend phone-verification flow does not need a Termii-specific API.

## Termii prerequisites

Create and verify the Meal05 Termii business account before activating the Supabase hook.

From the Termii dashboard:

- copy the account API base URL shown by Termii (Nigeria accounts commonly use `https://api.ng.termii.com`);
- create an API key for the production project;
- request/register the sender ID `Meal05` and wait for approval before production use;
- use an OTP/transactional example such as `Your Meal05 verification code is 123456. It expires soon. Do not share this code.` for the sender-ID use case;
- fund the Termii messaging balance before the live canary.

Do not paste or commit the Termii API key.

## Deploy the Edge Function

Deploy `supabase/functions/send-sms-termii/index.ts` with JWT verification disabled. Auth hooks are invoked before a user JWT necessarily exists; authenticity is enforced by Standard Webhooks signature verification instead.

Required Edge Function secrets:

```text
TERMII_API_KEY=<secret>
TERMII_BASE_URL=<base URL from Termii dashboard>
TERMII_SENDER_ID=Meal05
TERMII_SMS_CHANNEL=dnd
```

Do not set the hook secret until Supabase generates it in the next step.

## Configure Supabase Auth Hook

In Supabase Dashboard:

1. Authentication -> Hooks.
2. Add a **Send SMS** hook.
3. Choose **HTTPS**.
4. Use the deployed function URL for `send-sms-termii`.
5. Generate the hook secret and copy it once.
6. Save the hook.
7. Add the generated value to the Edge Function secrets as:

```text
SEND_SMS_HOOK_SECRETS=v1,whsec_<generated-secret>
```

The function supports multiple rotation secrets separated by `|`.

The Send SMS Hook replaces the built-in SMS sender while enabled. Keep the existing Twilio provider configuration untouched during the canary so rollback is simply disabling the hook.

## Canary

Use one controlled Nigerian number first.

Expected result:

- OTP request succeeds;
- one SMS arrives from the approved Meal05 sender ID;
- message contains a six-digit Supabase OTP;
- OTP verifies successfully in the existing Meal05 UI;
- Supabase Auth logs show the normal verification flow;
- Termii dashboard shows the message accepted/delivered;
- no OTP, phone number, API key, or hook secret is written to application logs.

Test resend behavior only after the first OTP succeeds. Do not spam the number during setup.

## Rollback

If Termii delivery fails during the canary:

1. Disable the Supabase Send SMS Hook.
2. Leave Twilio configured as the built-in provider.
3. Confirm OTP delivery resumes through Twilio.
4. Fix Termii configuration before re-enabling the hook.

No frontend rollback is required because the browser continues to call Supabase Auth, not Termii directly.

## Security notes

- The function accepts POST only.
- Every hook payload must pass Standard Webhooks signature verification.
- The Termii API key is read only from Edge Function secrets.
- Supabase supplies the OTP; Termii does not generate or verify it.
- The message is ASCII and intentionally short enough for one normal SMS segment.
- Provider/network failures return retryable HTTP responses where appropriate.
- The function does not intentionally log phone numbers or OTP values.
