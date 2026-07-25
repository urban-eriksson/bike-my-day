import { Star } from "lucide-react";
import { compass } from "@/lib/geo/compass";
import type { WeatherSnapshot } from "@/lib/weather/types";

/**
 * Shared presentation for the two forecast views — the live preview and the
 * stored one a push notification opens. They show the same verdict, so they
 * are the same components.
 */

/** Amber is reserved for the sky, and the score is the sky's verdict. */
export function Stars({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(5, Math.round(score)));
  return (
    <div className="flex gap-1" aria-label={`${clamped} of 5 stars`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Star
          key={i}
          aria-hidden
          className={
            i < clamped ? "size-7 fill-amber-400 text-amber-500" : "size-7 fill-muted text-border"
          }
        />
      ))}
    </div>
  );
}

/** The verdict, raised onto a card so it reads as the answer to the question. */
export function Verdict({ score, text }: { score: number | null; text: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      {score != null ? <Stars score={score} /> : null}
      <p className="mt-3 text-lg leading-relaxed font-medium text-balance text-foreground">
        {text}
      </p>
    </div>
  );
}

export function SnapshotDetails({ snapshot }: { snapshot: WeatherSnapshot | null }) {
  if (!snapshot || typeof snapshot.as_of_local !== "string") return null;
  return (
    <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm text-muted-foreground">
      <Row k="When" v={`${snapshot.as_of_local} (${snapshot.timezone})`} />
      <Row
        k="Temperature"
        v={`${snapshot.temperature_c} °C (feels ${snapshot.apparent_temperature_c})`}
      />
      <Row
        k="Precipitation"
        v={`${snapshot.precipitation_mm} mm${snapshot.precipitation_probability_pct === null ? "" : ` (${snapshot.precipitation_probability_pct}%)`}`}
      />
      <Row
        k="Wind"
        v={`${snapshot.wind_speed_ms} m/s from ${compass(snapshot.wind_direction_from_deg)}, gusts ${snapshot.wind_gusts_ms} m/s`}
      />
      <Row k="Cloud cover" v={`${snapshot.cloud_cover_pct}%`} />
      <Row k="Sun" v={`${snapshot.sunrise_local.slice(11)} – ${snapshot.sunset_local.slice(11)}`} />
    </dl>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="font-medium text-foreground/80">{k}</dt>
      <dd>{v}</dd>
    </>
  );
}
