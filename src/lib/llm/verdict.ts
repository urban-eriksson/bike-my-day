import Anthropic from "@anthropic-ai/sdk";
import { bearing, type LatLon } from "@/lib/geo/bearing";
import { compass } from "@/lib/geo/compass";
import { windComponents } from "@/lib/geo/wind";
import type { WeatherSnapshot } from "@/lib/weather/types";

/**
 * Bike-ride context passed to the verdict generator: the leg endpoints, when
 * the rider is heading out, and the user's free-text preferences. Everything
 * the LLM needs to reason about whether the ride is a good idea is in here
 * plus the WeatherSnapshot.
 */
export type VerdictInput = {
  rideLabel: string;
  start: LatLon;
  end: LatLon;
  /** Free-text user preferences ("hate riding under 5°C, fine in light rain"). */
  preferences: string;
  snapshot: WeatherSnapshot;
};

export type VerdictPrompt = {
  system: string;
  user: string;
};

const round = (n: number, digits = 1): number => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

const SYSTEM_PROMPT = `You are the forecast generator for a bike-commute weather app.

You receive (a) a structured weather snapshot for a specific hour and place, including wind decomposed into headwind / crosswind along the rider's route, and (b) the user's own free-text preferences describing what makes or breaks a ride for them.

Your output has EXACTLY this shape — a score line, then the text:

SCORE: <integer 0-5>
<one or at most two short sentences>

The score rates how good the ride will be, honoring the user's preferences: 5 = perfect conditions, 3 = rideable but flawed, 0 = don't ride. The text is plain English — no Markdown, no emoji, no preamble — and:

- Tells the rider whether tomorrow's ride looks good, marginal, or bad, consistent with the score.
- Names the one or two factors that drove that judgment, in concrete numbers (°C, mm, m/s, compass direction).
- Honors the user's preferences over generic norms — if they say "fine in light rain", do not flag light rain as bad; if they say "headwind over 8 m/s is a no", flag any forecast above that.
- Uses headwind / tailwind language directly (the wind component along their leg is given to you — do not re-derive it from raw direction).

Do not hedge with "you might want to consider". Be direct. The rider will read this in 2 seconds and decide.`;

export function buildVerdictPrompt(input: VerdictInput): VerdictPrompt {
  const legBearing = bearing(input.start, input.end);
  const wind = windComponents(
    legBearing,
    input.snapshot.wind_direction_from_deg,
    input.snapshot.wind_speed_ms,
  );
  const gustComponent = windComponents(
    legBearing,
    input.snapshot.wind_direction_from_deg,
    input.snapshot.wind_gusts_ms,
  );

  const headTail =
    wind.headwind > 0
      ? `headwind ${round(wind.headwind)} m/s`
      : `tailwind ${round(-wind.headwind)} m/s`;
  const crossSide = wind.crosswind > 0 ? "from the left" : "from the right";
  const cross = `crosswind ${round(Math.abs(wind.crosswind))} m/s ${crossSide}`;
  const gustHead =
    gustComponent.headwind > 0
      ? `gusting to ${round(gustComponent.headwind)} m/s headwind`
      : `gusting to ${round(-gustComponent.headwind)} m/s tailwind`;

  const lines = [
    `Ride: ${input.rideLabel}`,
    `Hour: ${input.snapshot.as_of_local} (${input.snapshot.timezone})`,
    `Leg bearing: ${Math.round(legBearing)}° (${compass(legBearing)})`,
    "",
    `Temperature: ${round(input.snapshot.temperature_c)} °C (feels like ${round(input.snapshot.apparent_temperature_c)} °C)`,
    `Precipitation: ${round(input.snapshot.precipitation_mm, 2)} mm${
      input.snapshot.precipitation_probability_pct === null
        ? ""
        : ` (${input.snapshot.precipitation_probability_pct}% chance)`
    }`,
    `Cloud cover: ${input.snapshot.cloud_cover_pct}%`,
    `Wind: ${round(input.snapshot.wind_speed_ms)} m/s from ${input.snapshot.wind_direction_from_deg}° (${compass(input.snapshot.wind_direction_from_deg)}), ${headTail}, ${cross}`,
    `Gusts: ${round(input.snapshot.wind_gusts_ms)} m/s, ${gustHead}`,
    `Daylight at depart: ${input.snapshot.is_day ? "yes" : "no"} (sunrise ${input.snapshot.sunrise_local}, sunset ${input.snapshot.sunset_local})`,
    `WMO weather code: ${input.snapshot.weather_code}`,
    "",
    "User preferences (free text — let these override generic norms):",
    input.preferences.trim() === "" ? "(none — apply sensible defaults)" : input.preferences.trim(),
  ];

  return { system: SYSTEM_PROMPT, user: lines.join("\n") };
}

export type VerdictResult = {
  text: string;
  /** 0–5 ride quality, null if the model's score line couldn't be parsed. */
  score: number | null;
  usage: { input_tokens: number; output_tokens: number };
};

/**
 * Splits the model's "SCORE: n\n<text>" shape. Defensive: a malformed score
 * line degrades to score=null with the raw text kept, never a hard failure —
 * a notification without stars beats no notification.
 */
export function parseVerdictOutput(raw: string): { text: string; score: number | null } {
  const match = raw.match(/^\s*SCORE:\s*([0-5])\s*\n/);
  if (!match) return { text: raw.trim(), score: null };
  return {
    text: raw.slice(match[0].length).trim(),
    score: Number.parseInt(match[1], 10),
  };
}

export type GenerateVerdictOptions = {
  /** Inject a custom Anthropic client for tests. */
  client?: Anthropic;
  /** Override the model — defaults to claude-haiku-4-5 per project decision. */
  model?: string;
};

export async function generateVerdict(
  input: VerdictInput,
  options: GenerateVerdictOptions = {},
): Promise<VerdictResult> {
  const client = options.client ?? new Anthropic();
  const { system, user } = buildVerdictPrompt(input);

  const response = await client.messages.create({
    model: options.model ?? "claude-haiku-4-5",
    max_tokens: 256,
    system,
    messages: [{ role: "user", content: user }],
  });

  const raw = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const { text, score } = parseVerdictOutput(raw);

  return {
    text,
    score,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
  };
}
