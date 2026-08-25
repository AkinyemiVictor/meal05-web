import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

type HookEvent = {
  user?: {
    phone?: string | null;
  };
  sms?: {
    otp?: string | null;
  };
};

type TermiiResponse = {
  code?: string;
  message?: string;
  message_id?: string | number;
};

const JSON_HEADERS = { "Content-Type": "application/json" };
const TERMII_TIMEOUT_MS = 3500;

const json = (body: unknown, status = 200, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });

const env = (name: string) => String(Deno.env.get(name) || "").trim();

const normalizePhone = (value: string | null | undefined) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";

  // Supabase normally supplies E.164 (+234...), while Termii examples use digits only.
  // Keep a small Nigerian-local fallback for defensive compatibility.
  if (digits.length === 11 && digits.startsWith("0")) {
    return `234${digits.slice(1)}`;
  }

  return digits;
};

const parseHookSecrets = (value: string) =>
  value
    .split("|")
    .map((secret) => secret.trim())
    .filter(Boolean)
    .map((secret) => secret.replace(/^v1,whsec_/, ""));

const verifyHookEvent = (payload: string, headers: Record<string, string>, rawSecrets: string) => {
  const secrets = parseHookSecrets(rawSecrets);
  if (!secrets.length) throw new Error("SMS hook secret is not configured");

  let lastError: unknown = null;
  for (const secret of secrets) {
    try {
      return new Webhook(secret).verify(payload, headers) as HookEvent;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("SMS hook signature verification failed");
};

const providerAccepted = (response: Response, result: TermiiResponse) => {
  if (!response.ok) return false;
  if (result?.message_id !== undefined && result?.message_id !== null) return true;
  if (String(result?.code || "").toLowerCase() === "ok") return true;
  return /successfully sent/i.test(String(result?.message || ""));
};

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ error: { http_code: 405, message: "Method not allowed" } }, 405);
  }

  const hookSecrets = env("SEND_SMS_HOOK_SECRETS");
  const termiiApiKey = env("TERMII_API_KEY");
  const termiiBaseUrl = env("TERMII_BASE_URL").replace(/\/+$/, "");
  const termiiSenderId = env("TERMII_SENDER_ID");
  const termiiChannel = env("TERMII_SMS_CHANNEL") || "dnd";

  if (!hookSecrets || !termiiApiKey || !termiiBaseUrl || !termiiSenderId) {
    return json(
      { error: { http_code: 500, message: "SMS delivery is not configured" } },
      500,
    );
  }

  const payload = await request.text();
  const headers = Object.fromEntries(request.headers);

  let event: HookEvent;
  try {
    event = verifyHookEvent(payload, headers, hookSecrets);
  } catch {
    return json(
      { error: { http_code: 401, message: "Invalid SMS hook signature" } },
      401,
    );
  }

  const phone = normalizePhone(event?.user?.phone);
  const otp = String(event?.sms?.otp || "").trim();

  if (!/^\d{10,15}$/.test(phone) || !/^\d{6}$/.test(otp)) {
    return json(
      { error: { http_code: 400, message: "Invalid SMS hook payload" } },
      400,
    );
  }

  // Keep auth SMS ASCII-only and comfortably inside one GSM SMS segment.
  const message = `Your Meal05 verification code is ${otp}. It expires soon. Do not share this code.`;

  let response: Response;
  let result: TermiiResponse = {};
  try {
    response = await fetch(`${termiiBaseUrl}/api/sms/send`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        to: phone,
        from: termiiSenderId,
        sms: message,
        type: "plain",
        channel: termiiChannel,
        api_key: termiiApiKey,
      }),
      signal: AbortSignal.timeout(TERMII_TIMEOUT_MS),
    });
    result = (await response.json().catch(() => ({}))) as TermiiResponse;
  } catch {
    return json(
      { error: { http_code: 503, message: "SMS provider is temporarily unavailable" } },
      503,
      { "retry-after": "2" },
    );
  }

  if (!providerAccepted(response, result)) {
    const retryable = response.status === 429 || response.status >= 500;
    return json(
      {
        error: {
          http_code: retryable ? 503 : 502,
          message: "SMS provider rejected the message",
        },
      },
      retryable ? 503 : 502,
      retryable ? { "retry-after": "2" } : {},
    );
  }

  return json({}, 200);
});
