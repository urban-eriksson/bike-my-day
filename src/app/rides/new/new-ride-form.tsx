"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createRide, type CreateRideState } from "../actions";
import { AddressField } from "./address-field";
import { useT } from "@/components/i18n-provider";

const INITIAL: CreateRideState = { status: "idle" };

/** Display order, Monday first; names come from the dictionary. */
const DAY_VALUES = [1, 2, 3, 4, 5, 6, 0];
const DEFAULT_DAYS = [1, 2, 3, 4, 5];

export function NewRideForm() {
  const t = useT();
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

      <Field label={t.ride.label} htmlFor="label">
        <Input
          id="label"
          name="label"
          type="text"
          required
          defaultValue={v.label ?? ""}
          placeholder={t.ride.labelPlaceholder}
        />
      </Field>

      <AddressField
        id="start_address"
        name="start_address"
        label={t.ride.start}
        placeholder={t.ride.startPlaceholder}
        defaultValue={v.start_address ?? ""}
      />

      <AddressField
        id="end_address"
        name="end_address"
        label={t.ride.end}
        placeholder={t.ride.endPlaceholder}
        defaultValue={v.end_address ?? ""}
      />

      <Field label={t.ride.departTime} htmlFor="depart_local_time">
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
        {t.ride.roundTrip}
      </label>

      {roundTrip ? (
        <Field label={t.ride.returnTime} htmlFor="return_local_time">
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
        <legend className="text-sm font-medium">{t.ride.daysOfWeek}</legend>
        <div className="flex flex-wrap gap-2">
          {DAY_VALUES.map((value) => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm transition-colors has-checked:border-primary has-checked:bg-primary/10 has-checked:font-medium has-checked:text-primary has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
            >
              <input
                type="checkbox"
                name="days_of_week"
                value={value}
                defaultChecked={days.includes(value)}
                className="sr-only"
              />
              {t.days.short[value]}
            </label>
          ))}
        </div>
      </fieldset>

      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? t.ride.creating : t.ride.create}
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
