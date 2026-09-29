import type { ApiConfig } from "./config.ts";

export interface MagicLinkMailer {
  send(email: string, magicLink: string): Promise<void>;
}

export function createMailer(config: ApiConfig): MagicLinkMailer {
  if (config.mailProvider === "console") {
    return {
      async send(email, magicLink) {
        console.log(`[magic-link] ${email}: ${magicLink}`);
      },
    };
  }

  return {
    async send(email, magicLink) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: config.authFromEmail,
          to: [email],
          subject: "Sign in to StreamWarden",
          html: `<p>Use this secure link to sign in to StreamWarden:</p><p><a href="${escapeHtml(magicLink)}">Sign in to StreamWarden</a></p><p>This link expires in 15 minutes and can be used once.</p>`,
          text: `Sign in to StreamWarden: ${magicLink}\n\nThis link expires in 15 minutes and can be used once.`,
        }),
      });
      if (!response.ok) {
        throw new Error(`Resend rejected the message with status ${response.status}`);
      }
    },
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
