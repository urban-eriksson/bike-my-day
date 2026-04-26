"use client";

import { useActionState, useEffect, useState } from "react";
import { createRide, type CreateRideState } from "../actions";

const INITIAL: CreateRideState = { status: "idle" };

const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];
const DEFAULT_DAYS = [1, 2, 3, 4, 5];

export function NewRideForm() {
  const [state, formAction, pending] = useActionState(createRide, INITIAL);
  const [timezone, setTimezone] = useState("");

  useEffect(() => {
    // Reading the browser's IANA timezone is inherently client-only, and we
    // need it as state so the hidden input updates after hydration. The
    // react-hooks rule flags this as a derivable-state smell, but here the
    // browser API genuinely is the source of truth.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  const v = state.values ?? {};
  const days = v.days_of_week ?? DEFAULT_DAYS;

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <input type="hidden" name="timezone" value={timezone} />

      <Field label="Label" htmlFor="label">
        <input
          id="label"
          name="label"
          type="text"
          required
          defaultValue={v.label ?? ""}
          placeholder="Morning commute"
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </Field>

      <Field label="Start (place name)" htmlFor="start_address">
        <input
          id="start_address"
          name="start_address"
          type="text"
          required
          defaultValue={v.start_address ?? ""}
          placeholder="Uppsala"
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </Field>

      <Field label="End (place name)" htmlFor="end_address">
        <input
          id="end_address"
          name="end_address"
          type="text"
          required
          defaultValue={v.end_address ?? ""}
          placeholder="Stockholm"
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </Field>

      <Field label="Depart time" htmlFor="depart_local_time">
        <input
          id="depart_local_time"
          name="depart_local_time"
          type="time"
          required
          defaultValue={v.depart_local_time ?? "08:00"}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Days of week</legend>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((d) => (
            <label
              key={d.value}
              className="flex cursor-pointer items-center gap-1 rounded border border-gray-300 px-2 py-1 text-sm has-checked:border-black has-checked:bg-black has-checked:text-white"
            >
              <input
                type="checkbox"
                name="days_of_week"
                value={d.value}
                defaultChecked={days.includes(d.value)}
                className="sr-only"
              />
              {d.label}
            </label>
          ))}
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save ride"}
      </button>

      {state.message ? (
        <p role="status" className="text-sm text-red-600">
          {state.message}
        </p>
      ) : null}

      {timezone ? <p className="text-xs text-gray-500">Detected timezone: {timezone}</p> : null}
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}
