"use client";

import Link from "next/link";
import { BellOff, CloudSun, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";
import { deleteRide, updateRide, type UpdateRideState } from "@/app/rides/actions";
import { AddressField } from "@/app/rides/new/address-field";
import { useT } from "@/components/i18n-provider";
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
import { Spinner } from "@/components/ui/spinner";
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
import { Switch } from "@/components/ui/switch";
import { distanceKm } from "@/lib/geo/distance";
import { formatDays } from "@/lib/format-days";

/** Display order, Monday first; names come from the dictionary. */
const DAY_VALUES = [1, 2, 3, 4, 5, 6, 0];

export type RideCardData = {
  id: string;
  label: string;
  start_address: string;
  start_lat: number;
  start_lon: number;
  end_address: string;
  end_lat: number;
  end_lon: number;
  depart_local_time: string;
  return_local_time: string | null;
  days_of_week: number[];
  muted: boolean;
};

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

const INITIAL: UpdateRideState = { status: "idle" };

export function RideCard({ ride }: { ride: RideCardData }) {
  const t = useT();
  const [state, formAction, pending] = useActionState(updateRide, INITIAL);
  const [roundTrip, setRoundTrip] = useState(ride.return_local_time != null);
  const [notify, setNotify] = useState(!ride.muted);

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

          <form action={formAction} className="flex flex-col gap-4 px-4 pb-8">
            <input type="hidden" name="id" value={ride.id} />

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
                  "Save changes"
                )}
              </Button>
              {state.message ? (
                <span
                  role="status"
                  className={
                    state.status === "error"
                      ? "text-sm text-destructive"
                      : "text-sm font-medium text-primary"
                  }
                >
                  {state.message}
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
                {/* The dialog renders in a portal, so this form is not nested
                      in the surrounding edit form. */}
                <AlertDialogContent size="sm">
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t.ride.deleteTitle(ride.label)}</AlertDialogTitle>
                    <AlertDialogDescription>
                      Its forecasts stop tonight. There is no undo.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t.deleteAccountDialog.cancel}</AlertDialogCancel>
                    <form action={deleteRide} className="contents">
                      <input type="hidden" name="id" value={ride.id} />
                      <AlertDialogAction type="submit" variant="destructive">
                        Delete ride
                      </AlertDialogAction>
                    </form>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/40 px-4 py-3">
        <span className="text-sm text-muted-foreground">{t.dashboard.km(km.toFixed(1))}</span>
        {/* Default prefetch fetches the route's loading boundary, so the
            "checking the weather" screen is on-screen the instant this is
            tapped — the wait is the LLM call, and it must be visible. */}
        <Button asChild size="sm">
          <Link href={`/rides/${ride.id}/preview`}>
            <CloudSun aria-hidden /> {t.dashboard.forecast}
          </Link>
        </Button>
      </div>
    </li>
  );
}
