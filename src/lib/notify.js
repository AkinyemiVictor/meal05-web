import "server-only";
import { renderReceiptHtml } from "@/lib/email-templates";

const hasSendgrid = () => Boolean(process.env.SENDGRID_API_KEY && process.env.EMAIL_FROM);
const hasResend = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
// Require full SMTP creds to avoid triggering nodemailer path accidentally in dev
const hasSmtp = () =>
  Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.EMAIL_FROM
  );

async function sendViaSendgrid({ to, subject, html }) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const from = process.env.EMAIL_FROM;
  const body = {
    personalizations: [{ to: [{ email: to }] }],
    from: { email: from, name: process.env.EMAIL_FROM_NAME || "Meal05" },
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
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
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
    EMAIL_FROM,
    EMAIL_FROM_NAME = "Meal05",
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
    from: { name: EMAIL_FROM_NAME, address: EMAIL_FROM },
    to,
    subject,
    html,
  });
}

export async function sendOrderReceiptEmail({ to, order }) {
  if (!to) return;
  try {
    const html = renderReceiptHtml(order, {});
    const subject = `Your Meal05 order ${order?.orderId || ""}`.trim();
    if (hasResend()) {
      await sendViaResend({ to, subject, html });
    } else if (hasSendgrid()) {
      await sendViaSendgrid({ to, subject, html });
    } else if (hasSmtp()) {
      await sendViaSmtp({ to, subject, html });
    } else {
      console.info("[email:disabled] Would send receipt to", to, { subject });
    }
  } catch (e) {
    console.warn("Failed to send order receipt email", e);
  }
}

const notifyApi = { sendOrderReceiptEmail };

export default notifyApi;
