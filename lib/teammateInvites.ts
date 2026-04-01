import { randomBytes } from "node:crypto";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()-_=+";

type SendInviteEmailArgs = {
  toEmail: string;
  temporaryPassword: string;
  teammateName?: string | null;
  invitedByName?: string | null;
};

function fallbackAppUrl() {
  return "https://operations.outdoorind.org";
}

export function resolveAppUrl() {
  const raw =
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    fallbackAppUrl();
  return raw.replace(/\/+$/, "");
}

export function resolveInviteFromEmail() {
  return (
    process.env.ALERTS_FROM_EMAIL?.trim() ||
    process.env.ALERT_FROM_EMAIL?.trim() ||
    process.env.TREND_DIGEST_FROM_EMAIL?.trim() ||
    "onboarding@resend.dev"
  );
}

export function generateTemporaryPassword(length = 16) {
  const size = Math.max(12, Math.min(48, Math.floor(length)));
  const bytes = randomBytes(size);
  const chars = Array.from(bytes, (byte) => PASSWORD_CHARS[byte % PASSWORD_CHARS.length] ?? "A").join("");

  const hasUpper = /[A-Z]/.test(chars);
  const hasLower = /[a-z]/.test(chars);
  const hasDigit = /[0-9]/.test(chars);
  const hasSymbol = /[^A-Za-z0-9]/.test(chars);
  if (hasUpper && hasLower && hasDigit && hasSymbol) return chars;

  const fallbackSeed = randomBytes(8).toString("hex");
  return `Oi!${fallbackSeed}#9`;
}

export async function sendTeammateInviteEmail(args: SendInviteEmailArgs) {
  const apiKey = process.env.RESEND_API_KEY?.trim() || "";
  if (!apiKey) {
    return { sent: false, configured: false, error: "Missing RESEND_API_KEY" as string | null };
  }

  const appUrl = resolveAppUrl();
  const fromEmail = resolveInviteFromEmail();
  const displayName = (args.teammateName ?? "").trim() || args.toEmail;
  const invitedBy = (args.invitedByName ?? "").trim() || "Outdoor Independence LLC";
  const loginUrl = `${appUrl}/login`;

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#111;">
      <h2 style="margin:0 0 12px 0;">You are invited to Outdoor Independence LLC Operations App</h2>
      <p style="margin:0 0 10px 0;">Hi ${escapeHtml(displayName)},</p>
      <p style="margin:0 0 10px 0;">${escapeHtml(invitedBy)} created your teammate account.</p>
      <p style="margin:0 0 6px 0;"><strong>Login:</strong> ${escapeHtml(args.toEmail)}</p>
      <p style="margin:0 0 12px 0;"><strong>Temporary password:</strong> ${escapeHtml(args.temporaryPassword)}</p>
      <p style="margin:0 0 14px 0;">On first sign-in, you will be prompted to change your password.</p>
      <a href="${loginUrl}" style="display:inline-block;padding:10px 14px;background:#0f766e;color:#fff;text-decoration:none;border-radius:8px;">
        Open Operations App
      </a>
      <p style="margin:14px 0 0 0;color:#4a5568;font-size:12px;">If the button does not work, open: ${escapeHtml(loginUrl)}</p>
    </div>
  `;

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [args.toEmail],
      subject: "Your Outdoor Independence LLC app login",
      html,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    return { sent: false, configured: true, error: `Resend ${response.status}: ${text}` };
  }

  return { sent: true, configured: true, error: null as string | null };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
