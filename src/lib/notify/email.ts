import { Resend } from "resend";
import type { Channel, ChannelDestination, DispatchResult, VerdictNotification } from "./types";

export type EmailChannelOptions = {
  /** Defaults to the env var; injectable for tests. */
  apiKey?: string;
  /** "Tomorrow's commute — Sender Name <noreply@your.domain>". Falls back to env var, then resend.dev. */
  from?: string;
  /** Inject a custom Resend instance for tests. */
  client?: Resend;
};

const DEFAULT_FROM = "bike-my-day <onboarding@resend.dev>";

export function createEmailChannel(options: EmailChannelOptions = {}): Channel {
  const client = options.client ?? new Resend(options.apiKey ?? process.env.RESEND_API_KEY);
  const from = options.from ?? process.env.EMAIL_FROM ?? DEFAULT_FROM;

  return {
    kind: "email",
    async send(
      notification: VerdictNotification,
      dest: ChannelDestination,
    ): Promise<DispatchResult> {
      if (dest.kind !== "email") {
        throw new Error(`Email channel can't dispatch to ${dest.kind}`);
      }

      const subject = `${notification.rideLabel} — ${notification.whenLocal.slice(11, 16)}: ${shortVerdict(notification.verdictText)}`;
      const text = renderText(notification);
      const html = renderHtml(notification);

      const response = await client.emails.send({
        from,
        to: [dest.email],
        subject,
        text,
        html,
      });
      if (response.error) {
        throw new Error(`Resend send failed: ${response.error.message}`);
      }
      return { external_id: response.data?.id };
    },
  };
}

function shortVerdict(text: string): string {
  // Take the first sentence-ish chunk for the subject line.
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 60) return trimmed;
  return trimmed.slice(0, 57) + "…";
}

function renderText(n: VerdictNotification): string {
  const lines = [n.verdictText, "", `Ride: ${n.rideLabel}`, `When: ${n.whenLocal}`];
  if (n.details) {
    const d = n.details;
    if (d.temperatureC !== undefined) {
      lines.push(
        `Temp: ${d.temperatureC} °C${d.apparentTemperatureC !== undefined ? ` (feels ${d.apparentTemperatureC})` : ""}`,
      );
    }
    if (d.precipitationMm !== undefined) lines.push(`Rain: ${d.precipitationMm} mm`);
    if (d.windSpeedMs !== undefined) {
      lines.push(
        `Wind: ${d.windSpeedMs} m/s${d.windGustsMs !== undefined ? ` (gusts ${d.windGustsMs})` : ""}`,
      );
    }
  }
  return lines.join("\n");
}

function renderHtml(n: VerdictNotification): string {
  const detailRows: string[] = [];
  if (n.details) {
    const d = n.details;
    if (d.temperatureC !== undefined) {
      detailRows.push(
        row(
          "Temp",
          `${d.temperatureC} °C${d.apparentTemperatureC !== undefined ? ` (feels ${d.apparentTemperatureC})` : ""}`,
        ),
      );
    }
    if (d.precipitationMm !== undefined) detailRows.push(row("Rain", `${d.precipitationMm} mm`));
    if (d.windSpeedMs !== undefined) {
      detailRows.push(
        row(
          "Wind",
          `${d.windSpeedMs} m/s${d.windGustsMs !== undefined ? ` (gusts ${d.windGustsMs})` : ""}`,
        ),
      );
    }
  }
  return `<!doctype html><html><body style="font-family:-apple-system,Helvetica,Arial,sans-serif;color:#111;max-width:480px;margin:32px auto;padding:0 16px;">
  <p style="font-size:18px;font-weight:600;line-height:1.4;margin:0 0 24px 0;">${escapeHtml(n.verdictText)}</p>
  <p style="font-size:13px;color:#666;margin:0 0 4px 0;">Ride: ${escapeHtml(n.rideLabel)}</p>
  <p style="font-size:13px;color:#666;margin:0 0 16px 0;">When: ${escapeHtml(n.whenLocal)}</p>
  ${detailRows.length > 0 ? `<table style="font-size:12px;color:#666;border-collapse:collapse;">${detailRows.join("")}</table>` : ""}
</body></html>`;
}

function row(k: string, v: string): string {
  return `<tr><td style="padding:2px 12px 2px 0;font-weight:500;">${escapeHtml(k)}</td><td style="padding:2px 0;">${escapeHtml(v)}</td></tr>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
