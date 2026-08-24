import "server-only";

import { formatAvailabilityDuration } from "@/lib/availability-settings";
import { sendTransactionalEmail } from "@/lib/notify";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const getSiteOrigin = () => {
  const candidate =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.APP_BASE_URL ||
    process.env.SITE_URL ||
    "https://meal05.com";
  try {
    return new URL(candidate).origin;
  } catch {
    return "https://meal05.com";
  }
};

const hasEmailProvider = () => {
  const from = process.env.EMAIL_FROM || process.env.RECEIPT_FROM_EMAIL || "";
  if (!from) return false;
  if (process.env.RESEND_API_KEY || process.env.RESEND_API_TOKEN) return true;
  if (process.env.SENDGRID_API_KEY) return true;
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS
  );
};

const buildPayload = ({ request, status, paymentWindowMinutes }) => {
  const requestNumber = String(request?.request_number || "Availability request");
  const href = `${getSiteOrigin()}/availability-requests/${encodeURIComponent(request.id)}`;
  if (status === "confirmed") {
    const paymentWindow = formatAvailabilityDuration(paymentWindowMinutes || 120);
    return {
      event: "availability_request_confirmed",
      subject: `${requestNumber} is ready for payment`,
      body: `${requestNumber} is confirmed. Complete payment within ${paymentWindow} to keep this availability. Open ${href}`,
      emailLead: "Your Meal05 basket is confirmed and ready for payment.",
      emailDetail: `Complete payment within ${paymentWindow} to keep the confirmed availability.`,
      buttonLabel: "Continue to payment",
      href,
    };
  }
  if (status === "action_required") {
    return {
      event: "availability_request_action_required",
      subject: `${requestNumber} needs your attention`,
      body: `${requestNumber} has an item we could not confirm. Review the request to continue with the rest of your basket. Open ${href}`,
      emailLead: "One or more items in your Meal05 basket need your attention.",
      emailDetail: "Review the unavailable item and choose how you want to continue with the rest of the basket.",
      buttonLabel: "Review basket",
      href,
    };
  }
  return null;
};

const renderEmail = ({ request, payload }) => `<!doctype html>
<html>
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
  <body style="margin:0;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#292524">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;background:#f5f5f4">
      <tr><td align="center">
        <table role="presentation" width="620" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #e7e5e4;border-radius:16px">
          <tr><td style="padding:28px">
            <div style="font-size:20px;font-weight:800;color:#166534">Meal05</div>
            <h1 style="margin:18px 0 10px;font-size:24px;color:#292524">${escapeHtml(payload.subject)}</h1>
            <p style="margin:0;color:#57534e;line-height:1.65">${escapeHtml(payload.emailLead)}</p>
            <p style="margin:12px 0 0;color:#57534e;line-height:1.65">${escapeHtml(payload.emailDetail)}</p>
            <p style="margin:12px 0 0;color:#78716c;font-size:13px">Request ${escapeHtml(request.request_number || request.id)}</p>
            <p style="margin:24px 0 0"><a href="${escapeHtml(payload.href)}" style="display:inline-block;background:#166534;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:800">${escapeHtml(payload.buttonLabel)}</a></p>
            <p style="margin:24px 0 0;color:#78716c;font-size:12px;line-height:1.6">No payment is taken until you choose to continue with the confirmed basket.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

const findExisting = async ({ admin, userId, channel, event, subject }) => {
  const { data, error } = await admin
    .from("notifications")
    .select("id,status,error")
    .eq("user_id", userId)
    .eq("channel", channel)
    .eq("event", event)
    .eq("subject", subject)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
};

const recordInApp = async ({ admin, request, payload, nowIso }) => {
  const existing = await findExisting({
    admin,
    userId: request.user_id,
    channel: "in_app",
    event: payload.event,
    subject: payload.subject,
  });
  if (existing) return { delivered: false, replayed: true };
  const { error } = await admin.from("notifications").insert({
    user_id: request.user_id,
    channel: "in_app",
    event: payload.event,
    subject: payload.subject,
    body: payload.body,
    status: "delivered",
    sent_at: nowIso,
  });
  if (error) throw error;
  return { delivered: true, replayed: false };
};

const resolveUserEmail = async ({ admin, userId }) => {
  try {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error) return "";
    const email = String(data?.user?.email || "").trim().toLowerCase();
    return EMAIL_RE.test(email) ? email : "";
  } catch {
    return "";
  }
};

const recordEmail = async ({ admin, request, payload, nowIso }) => {
  if (!hasEmailProvider()) return { delivered: false, reason: "provider_disabled" };
  const recipient = await resolveUserEmail({ admin, userId: request.user_id });
  if (!recipient) return { delivered: false, reason: "recipient_missing" };

  const existing = await findExisting({
    admin,
    userId: request.user_id,
    channel: "email",
    event: payload.event,
    subject: payload.subject,
  });
  if (existing && ["sent", "delivered"].includes(existing.status)) {
    return { delivered: false, replayed: true };
  }

  try {
    await sendTransactionalEmail({
      to: recipient,
      subject: payload.subject,
      html: renderEmail({ request, payload }),
    });
    if (existing) {
      await admin.from("notifications").update({
        recipient,
        body: payload.body,
        status: "sent",
        error: null,
        sent_at: nowIso,
      }).eq("id", existing.id);
    } else {
      await admin.from("notifications").insert({
        user_id: request.user_id,
        channel: "email",
        event: payload.event,
        recipient,
        subject: payload.subject,
        body: payload.body,
        status: "sent",
        sent_at: nowIso,
      });
    }
    return { delivered: true, replayed: false };
  } catch (emailError) {
    const errorMessage = String(emailError?.message || "Email delivery failed").slice(0, 1000);
    if (existing) {
      await admin.from("notifications").update({
        recipient,
        body: payload.body,
        status: "failed",
        error: errorMessage,
        sent_at: null,
      }).eq("id", existing.id);
    } else {
      await admin.from("notifications").insert({
        user_id: request.user_id,
        channel: "email",
        event: payload.event,
        recipient,
        subject: payload.subject,
        body: payload.body,
        status: "failed",
        error: errorMessage,
      });
    }
    return { delivered: false, reason: "send_failed" };
  }
};

export async function sendAvailabilityReengagement({
  admin,
  request,
  status = request?.status,
  paymentWindowMinutes = 120,
  now = new Date(),
}) {
  if (!admin || !request?.id || !request?.user_id) return { skipped: true, reason: "invalid_request" };
  const payload = buildPayload({ request, status, paymentWindowMinutes });
  if (!payload) return { skipped: true, reason: "status_not_actionable" };
  const nowIso = new Date(now).toISOString();

  let inApp = { delivered: false };
  try {
    inApp = await recordInApp({ admin, request, payload, nowIso });
  } catch (notificationError) {
    console.warn("Failed to record availability in-app re-engagement", notificationError);
  }

  const email = await recordEmail({ admin, request, payload, nowIso }).catch((emailError) => {
    console.warn("Failed to process availability email re-engagement", emailError);
    return { delivered: false, reason: "email_processing_failed" };
  });

  return { skipped: false, payload, inApp, email };
}
