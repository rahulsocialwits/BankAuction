/*
 * Sends one plain-text email through Resend (https://resend.com), but only when RESEND_API_KEY and MAIL_FROM are set in the
 * environment. Without them nothing is sent and the function says so (false): callers fall back to the admin-assisted flow.
 * No library is needed: it is one HTTPS call.
 */
export const mailConfigured = () => !!(process.env.RESEND_API_KEY?.trim() && process.env.MAIL_FROM?.trim());

export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  if (!mailConfigured()) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.MAIL_FROM!.trim(), to: [to], subject, text }),
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
