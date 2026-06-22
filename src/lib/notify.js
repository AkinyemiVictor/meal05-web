import "server-only";
import {
  renderAdminOrderAlertHtml,
  renderOrderConfirmationHtml,
  renderReceiptHtml,
} from "@/lib/email-templates";

const getFromEmail = () => process.env.EMAIL_FROM || process.env.RECEIPT_FROM_EMAIL || "";
const getFromName = () => process.env.EMAIL_FROM_NAME || process.env.RECEIPT_FROM_NAME || "Meal05";
const hasSendgrid = () => Boolean(process.env.SENDGRID_API_KEY && getFromEmail());
const hasResend = () => Boolean((process.env.RESEND_API_KEY || process.env.RESEND_API_TOKEN) && getFromEmail());
// Require full SMTP creds to avoid triggering nodemailer path accidentally in dev
const hasSmtp = () =>
  Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      getFromEmail()
  );

const readEmailList = (value) =>
  String(value || "")
    .split(/[,\s;]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry));

const getAdminOrderAlertRecipients = () =>
  Array.from(
    new Set(
      readEmailList(
        process.env.ADMIN_ORDER_ALERT_EMAILS ||
          process.env.ORDER_ALERT_EMAILS ||
          process.env.ADMIN_EMAILS ||
          process.env.NEXT_PUBLIC_ADMIN_EMAILS
      )
    )
  );

async function sendViaSendgrid({ to, subject, html }) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const from = getFromEmail();
  const body = {
    personalizations: [{ to: [{ email: to }] }],
    from: { email: from, name: getFromName() },
    subject,
    content: [{ type: "text/html", value: html }],
  };
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`SendGrid error ${res.status}: ${msg}`);
  }
}

async function sendViaResend({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY || process.env.RESEND_API_TOKEN;
  const fromEmail = getFromEmail();
  const fromName = getFromName();
  const from = fromEmail.includes("<") ? fromEmail : `${fromName} <${fromEmail}>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: Array.isArray(to) ? to : [to], subject, html }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`Resend error ${res.status}: ${msg}`);
  }
}

async function sendViaSmtp({ to, subject, html }) {
  const {
    SMTP_HOST,
    SMTP_PORT = 587,
    SMTP_USER,
    SMTP_PASS,
  } = process.env;
  // Lazy import nodemailer
  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: String(SMTP_PORT) === "465",
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });
  await transporter.sendMail({
    from: { name: getFromName(), address: getFromEmail() },
    to,
    subject,
    html,
  });
}

export async function sendTransactionalEmail({ to, subject, html }) {
  if (!to) return;
  const recipients = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
  if (!recipients.length) return;
  if (hasResend()) {
    await sendViaResend({ to: recipients, subject, html });
  } else if (hasSendgrid()) {
    await Promise.all(recipients.map((recipient) => sendViaSendgrid({ to: recipient, subject, html })));
  } else if (hasSmtp()) {
    await sendViaSmtp({ to: recipients.join(","), subject, html });
  } else {
    console.info("[email:disabled] Would send email", { to: recipients, subject });
  }
}

export async function sendOrderConfirmationEmail({ to, order }) {
  if (!to) return;
  try {
    const html = renderOrderConfirmationHtml(order, {});
    const subject = `Meal05 order received - ${order?.orderId || "Order"}`;
    await sendTransactionalEmail({ to, subject, html });
  } catch (e) {
    console.warn("Failed to send order confirmation email", e);
  }
}

export async function sendOrderReceiptEmail({ to, order }) {
  if (!to) return;
  try {
    const html = renderReceiptHtml(order, {});
    const subject = `Your Meal05 order ${order?.orderId || ""}`.trim();
    await sendTransactionalEmail({ to, subject, html });
  } catch (e) {
    console.warn("Failed to send order receipt email", e);
  }
}

export async function sendAdminOrderAlertEmail({ order }) {
  const recipients = getAdminOrderAlertRecipients();
  if (!recipients.length) return;
  try {
    const html = renderAdminOrderAlertHtml(order, {});
    const subject = `New Meal05 order - ${order?.orderId || "Order"}`;
    await sendTransactionalEmail({ to: recipients, subject, html });
  } catch (e) {
    console.warn("Failed to send admin order alert email", e);
  }
}

const notifyApi = {
  sendAdminOrderAlertEmail,
  sendOrderConfirmationEmail,
  sendOrderReceiptEmail,
  sendTransactionalEmail,
};

export default notifyApi;
