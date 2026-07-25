"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createRide, type CreateRideState } from "../actions";
import { AddressField } from "./address-field";

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
  const [roundTrip, setRoundTrip] = useState(false);

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
        <Input
          id="label"
          name="label"
          type="text"
          required
          defaultValue={v.label ?? ""}
          placeholder="Morning commute"
        />
      </Field>

      <AddressField
        id="start_address"
        name="start_address"
        label="Starting point"
        placeholder="Datavägen 9, Järfälla"
        defaultValue={v.start_address ?? ""}
      />

      <AddressField
        id="end_address"
        name="end_address"
        label="Destination"
        placeholder="Storgatan 1, Stockholm"
        defaultValue={v.end_address ?? ""}
      />

      <Field label="Depart time" htmlFor="depart_local_time">
        <Input
          id="depart_local_time"
          name="depart_local_time"
          type="time"
          required
          defaultValue={v.depart_local_time ?? "08:00"}
        />
      </Field>

      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          name="round_trip"
          checked={roundTrip}
          onChange={(e) => setRoundTrip(e.target.checked)}
          className="h-4 w-4"
        />
        Round trip
      </label>

      {roundTrip ? (
        <Field label="Return time" htmlFor="return_local_time">
          <Input
            id="return_local_time"
            name="return_local_time"
            type="time"
            required
            defaultValue={v.return_local_time ?? "17:00"}
          />
        </Field>
      ) : null}

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Days of week</legend>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((d) => (
            <label
              key={d.value}
              className="flex cursor-pointer items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm transition-colors has-checked:border-primary has-checked:bg-primary/10 has-checked:font-medium has-checked:text-primary has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
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

      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "Saving…" : "Save ride"}
      </Button>

      {state.message ? (
        <p role="status" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}

      {timezone ? (
        <p className="text-xs text-muted-foreground">Detected timezone: {timezone}</p>
      ) : null}
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
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
