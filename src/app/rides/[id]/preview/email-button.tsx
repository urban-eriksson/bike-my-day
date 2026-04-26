"use client";

import { useActionState } from "react";
import { emailVerdict, type EmailVerdictState } from "./actions";

const INITIAL: EmailVerdictState = { status: "idle" };

export type EmailButtonPayload = {
  rideId: string;
  rideLabel: string;
  verdictText: string;
  whenLocal: string;
  details: {
    temperatureC: number;
    apparentTemperatureC: number;
    precipitationMm: number;
    windSpeedMs: number;
    windGustsMs: number;
  };
};

export function EmailButton(props: EmailButtonPayload) {
  const [state, formAction, pending] = useActionState(emailVerdict, INITIAL);

  return (
    <form action={formAction} className="flex items-center gap-3">
      <input type="hidden" name="ride_id" value={props.rideId} />
      <input type="hidden" name="ride_label" value={props.rideLabel} />
      <input type="hidden" name="verdict_text" value={props.verdictText} />
      <input type="hidden" name="when_local" value={props.whenLocal} />
      <input type="hidden" name="temperature_c" value={String(props.details.temperatureC)} />
      <input
        type="hidden"
        name="apparent_temperature_c"
        value={String(props.details.apparentTemperatureC)}
      />
      <input type="hidden" name="precipitation_mm" value={String(props.details.precipitationMm)} />
      <input type="hidden" name="wind_speed_ms" value={String(props.details.windSpeedMs)} />
      <input type="hidden" name="wind_gusts_ms" value={String(props.details.windGustsMs)} />
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
      >
        {pending ? "Sending…" : "Email this verdict to me"}
      </button>
      {state.message ? (
        <span
          role="status"
          className={state.status === "error" ? "text-sm text-red-600" : "text-sm text-green-700"}
        >
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
