import { BellOff, CloudSun, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link } from "react-router";
import { AddressField } from "@/components/address-field";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { api, type Ride } from "@/lib/api";
import { errorText } from "@/lib/errors";
import { formatDays } from "@/lib/format-days";
import { distanceKm } from "@/lib/geo/distance";
import { useT } from "@/lib/i18n/provider";
import { rideFromForm } from "@/lib/ride-form";

/** Display order, Monday first; names come from the dictionary. */
const DAY_VALUES = [1, 2, 3, 4, 5, 6, 0];

/**
 * Address labels end with the country ("Datavägen 9, Järfälla, Sweden") —
 * constant noise on the cards. Drop the last comma segment when it looks
 * like a country (no digits, multi-segment label).
 */
function shortAddress(label: string): string {
  const parts = label.split(",").map((p) => p.trim());
  if (parts.length >= 2 && !/\d/.test(parts[parts.length - 1])) {
    return parts.slice(0, -1).join(", ");
  }
  return label;
}

export function RideCard({
  ride,
  onChanged,
  onDeleted,
}: {
  ride: Ride;
  onChanged: (ride: Ride) => void;
  onDeleted: (id: string) => void;
}) {
  const t = useT();
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<{ text: string; isError: boolean } | null>(null);
  const [roundTrip, setRoundTrip] = useState(ride.return_local_time != null);
  const [notify, setNotify] = useState(!ride.muted);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // The ride keeps its own timezone; an edit made while travelling must not move it.
    const parsed = rideFromForm(new FormData(e.currentTarget), ride.timezone, t);
    if ("error" in parsed) {
      setStatus({ text: parsed.error, isError: true });
      return;
    }
    setPending(true);
    setStatus(null);
    try {
      onChanged(await api<Ride>(`/rides/${ride.id}`, { method: "PUT", body: parsed.ride }));
      setStatus({ text: t.errors.saved, isError: false });
    } catch (err) {
      const context = { start: parsed.ride.start.address, end: parsed.ride.end.address };
      setStatus({ text: errorText(err, t, context), isError: true });
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    try {
      await api(`/rides/${ride.id}`, { method: "DELETE" });
      onDeleted(ride.id);
    } catch (err) {
      setStatus({ text: errorText(err, t), isError: true });
    }
  }

  const km = distanceKm(
    { lat: ride.start_lat, lon: ride.start_lon },
    { lat: ride.end_lat, lon: ride.end_lon },
  );

  return (
    <li className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <Sheet>
        <SheetTrigger asChild>
          <button
            type="button"
            className="w-full cursor-pointer px-4 pt-4 pb-3.5 text-left transition-colors hover:bg-muted/40 active:bg-muted/60"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-heading text-lg leading-tight font-semibold text-foreground">
                {ride.label}
              </h3>
              {/* Only the exception is worth a badge; notifications on is the norm. */}
              {ride.muted ? (
                <span className="mt-0.5 flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  <BellOff aria-hidden className="size-3.5" /> {t.dashboard.paused}
                </span>
              ) : null}
            </div>

            {/* Route rail: filled dot leaves, hollow dot arrives. */}
            <div className="mt-3 grid grid-cols-[auto_1fr] gap-x-3">
              <div aria-hidden className="flex flex-col items-center pt-1.5 pb-1.5">
                <span className="size-2.5 shrink-0 rounded-full bg-primary" />
                <span className="my-1 w-px flex-1 bg-border" />
                <span className="size-2.5 shrink-0 rounded-full border-2 border-primary bg-card" />
              </div>
              <div className="flex flex-col gap-2 text-[0.95rem] text-foreground/85">
                <span>{shortAddress(ride.start_address)}</span>
                <span>{shortAddress(ride.end_address)}</span>
              </div>
            </div>

            <div className="mt-3.5 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                {ride.depart_local_time.slice(0, 5)}
                {ride.return_local_time ? ` ⇄ ${ride.return_local_time.slice(0, 5)}` : ""}
              </span>{" "}
              · {formatDays(ride.days_of_week, t.days)}
            </div>
          </button>
        </SheetTrigger>

        <SheetContent
          side="bottom"
          className="max-h-[90dvh] overflow-y-auto"
          // Radix focuses the first field on open, which makes iOS select the
          // label text and offer the keyboard. Opening a ride is a look, not
          // an edit — let the rider choose the field.
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <SheetHeader>
            <SheetTitle>{t.ride.editTitle}</SheetTitle>
            <SheetDescription>{t.ride.editSubtitle}</SheetDescription>
          </SheetHeader>

          <form onSubmit={save} className="flex flex-col gap-4 px-4 pb-8">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`label-${ride.id}`}>{t.ride.label}</Label>
              <Input id={`label-${ride.id}`} name="label" required defaultValue={ride.label} />
            </div>

            <AddressField
              id={`start-${ride.id}`}
              name="start_address"
              label={t.ride.start}
              placeholder={t.ride.startPlaceholder}
              defaultValue={ride.start_address}
            />
            <AddressField
              id={`end-${ride.id}`}
              name="end_address"
              label={t.ride.end}
              placeholder={t.ride.endPlaceholder}
              defaultValue={ride.end_address}
            />

            <div className="flex flex-col gap-1">
              <Label htmlFor={`depart-${ride.id}`}>{t.ride.departTime}</Label>
              <Input
                id={`depart-${ride.id}`}
                name="depart_local_time"
                type="time"
                required
                defaultValue={ride.depart_local_time.slice(0, 5)}
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id={`roundtrip-${ride.id}`}
                name="round_trip"
                checked={roundTrip}
                onCheckedChange={(v) => setRoundTrip(v === true)}
              />
              <Label htmlFor={`roundtrip-${ride.id}`}>{t.ride.roundTrip}</Label>
            </div>

            {roundTrip ? (
              <div className="flex flex-col gap-1">
                <Label htmlFor={`return-${ride.id}`}>{t.ride.returnTime}</Label>
                <Input
                  id={`return-${ride.id}`}
                  name="return_local_time"
                  type="time"
                  required
                  defaultValue={ride.return_local_time?.slice(0, 5) ?? "17:00"}
                />
              </div>
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
                      defaultChecked={ride.days_of_week.includes(value)}
                      className="sr-only"
                    />
                    {t.days.short[value]}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="flex items-center gap-2">
              <Switch
                id={`notify-${ride.id}`}
                checked={notify}
                onCheckedChange={(v) => setNotify(v === true)}
              />
              <Label htmlFor={`notify-${ride.id}`}>{t.ride.notifications}</Label>
              {/* Switch is not a form control; mirror it for the action. */}
              {notify ? null : <input type="hidden" name="muted" value="on" />}
            </div>

            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <Button type="submit" disabled={pending}>
                {pending ? (
                  <>
                    <Spinner /> {t.ride.saving}
                  </>
                ) : (
                  t.ride.save
                )}
              </Button>
              {status ? (
                <span
                  role="status"
                  className={
                    status.isError ? "text-sm text-destructive" : "text-sm font-medium text-primary"
                  }
                >
                  {status.text}
                </span>
              ) : null}
            </div>

            <div className="mt-2 flex justify-start border-t border-border pt-4 pb-[env(safe-area-inset-bottom)]">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 /> {t.ride.delete}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent size="sm">
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t.ride.deleteTitle(ride.label)}</AlertDialogTitle>
                    <AlertDialogDescription>{t.ride.deleteBody}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t.deleteAccountDialog.cancel}</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={() => void remove()}>
                      {t.ride.delete}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/40 px-4 py-3">
        <span className="text-sm text-muted-foreground">{t.dashboard.km(km.toFixed(1))}</span>
        <Button asChild size="sm">
          <Link to={`/rides/${ride.id}/preview`}>
            <CloudSun aria-hidden /> {t.dashboard.forecast}
          </Link>
        </Button>
      </div>
    </li>
  );
}
