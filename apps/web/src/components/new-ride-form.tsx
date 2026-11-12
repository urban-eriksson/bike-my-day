import { type FormEvent, type ReactNode, useState } from "react";
import { AddressField } from "@/components/address-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, type Ride } from "@/lib/api";
import { errorText } from "@/lib/errors";
import { useT } from "@/lib/i18n/provider";
import { browserTimezone, rideFromForm } from "@/lib/ride-form";

/** Display order, Monday first; names come from the dictionary. */
const DAY_VALUES = [1, 2, 3, 4, 5, 6, 0];
const DEFAULT_DAYS = [1, 2, 3, 4, 5];

/**
 * The form keeps its own field values across a failed submit (they are
 * uncontrolled inputs that React does not reset outside form actions), so a
 * typo in one address does not cost the rider the rest.
 */
export function NewRideForm({ onCreated }: { onCreated: (ride: Ride) => void }) {
  const t = useT();
  const [timezone] = useState(browserTimezone);
  const [roundTrip, setRoundTrip] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = rideFromForm(new FormData(e.currentTarget), timezone, t);
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }
    setPending(true);
    setError(null);
    try {
      onCreated(await api<Ride>("/rides", { method: "POST", body: parsed.ride }));
    } catch (err) {
      setError(
        errorText(err, t, { start: parsed.ride.start.address, end: parsed.ride.end.address }),
      );
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
      <Field label={t.ride.label} htmlFor="label">
        <Input id="label" name="label" type="text" required placeholder={t.ride.labelPlaceholder} />
      </Field>

      <AddressField
        id="start_address"
        name="start_address"
        label={t.ride.start}
        placeholder={t.ride.startPlaceholder}
      />

      <AddressField
        id="end_address"
        name="end_address"
        label={t.ride.end}
        placeholder={t.ride.endPlaceholder}
      />

      <Field label={t.ride.departTime} htmlFor="depart_local_time">
        <Input
          id="depart_local_time"
          name="depart_local_time"
          type="time"
          required
          defaultValue="08:00"
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
            defaultValue="17:00"
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
                defaultChecked={DEFAULT_DAYS.includes(value)}
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

      {error ? (
        <p role="status" className="text-sm text-destructive">
          {error}
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
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
