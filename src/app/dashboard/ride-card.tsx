"use client";

import Link from "next/link";
import { Bell, BellOff } from "lucide-react";
import { useActionState, useState } from "react";
import { deleteRide, updateRide, type UpdateRideState } from "@/app/rides/actions";
import { AddressField } from "@/app/rides/new/address-field";
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
import { Switch } from "@/components/ui/switch";
import { distanceKm } from "@/lib/geo/distance";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

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
  const [state, formAction, pending] = useActionState(updateRide, INITIAL);
  const [roundTrip, setRoundTrip] = useState(ride.return_local_time != null);
  const [notify, setNotify] = useState(!ride.muted);

  const km = distanceKm(
    { lat: ride.start_lat, lon: ride.start_lon },
    { lat: ride.end_lat, lon: ride.end_lon },
  );

  return (
    <li className="rounded border border-gray-200 p-4 text-sm">
      <div className="flex items-start justify-between gap-4">
        <Sheet>
          <SheetTrigger asChild>
            <button type="button" className="flex-1 cursor-pointer text-left">
              <div className="flex items-center gap-2 font-medium text-gray-900">
                {ride.label}
                {ride.muted ? (
                  <BellOff aria-label="Notifications paused" className="h-4 w-4 text-gray-400" />
                ) : (
                  <Bell aria-label="Notifications on" className="h-4 w-4 text-gray-400" />
                )}
              </div>
              <div className="mt-1 text-gray-600">
                {shortAddress(ride.start_address)} → {shortAddress(ride.end_address)}{" "}
                <span className="whitespace-nowrap text-gray-400">({km.toFixed(1)} km)</span>
              </div>
              <div className="mt-1 text-xs text-gray-500">
                {ride.depart_local_time.slice(0, 5)}
                {ride.return_local_time ? ` ⇄ ${ride.return_local_time.slice(0, 5)}` : ""} ·{" "}
                {ride.days_of_week.map((d) => DAY_NAMES[d]).join(" ")}
              </div>
            </button>
          </SheetTrigger>

          <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Edit ride</SheetTitle>
              <SheetDescription>Changes apply from the next forecast.</SheetDescription>
            </SheetHeader>

            <form action={formAction} className="flex flex-col gap-4 px-4 pb-8">
              <input type="hidden" name="id" value={ride.id} />

              <div className="flex flex-col gap-1">
                <Label htmlFor={`label-${ride.id}`}>Label</Label>
                <Input id={`label-${ride.id}`} name="label" required defaultValue={ride.label} />
              </div>

              <AddressField
                id={`start-${ride.id}`}
                name="start_address"
                label="Starting point"
                placeholder="Datavägen 9, Järfälla"
                defaultValue={ride.start_address}
              />
              <AddressField
                id={`end-${ride.id}`}
                name="end_address"
                label="Destination"
                placeholder="Storgatan 1, Stockholm"
                defaultValue={ride.end_address}
              />

              <div className="flex flex-col gap-1">
                <Label htmlFor={`depart-${ride.id}`}>Depart time</Label>
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
                <Label htmlFor={`roundtrip-${ride.id}`}>Round trip</Label>
              </div>

              {roundTrip ? (
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`return-${ride.id}`}>Return time</Label>
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
                        defaultChecked={ride.days_of_week.includes(d.value)}
                        className="sr-only"
                      />
                      {d.label}
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
                <Label htmlFor={`notify-${ride.id}`}>Notifications</Label>
                {/* Switch is not a form control; mirror it for the action. */}
                {notify ? null : <input type="hidden" name="muted" value="on" />}
              </div>

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={pending}>
                  {pending ? "Saving…" : "Save changes"}
                </Button>
                {state.message ? (
                  <span
                    role="status"
                    className={
                      state.status === "error" ? "text-sm text-red-600" : "text-sm text-green-700"
                    }
                  >
                    {state.message}
                  </span>
                ) : null}
              </div>
            </form>
          </SheetContent>
        </Sheet>

        <div className="flex flex-col items-end gap-1">
          <Link
            href={`/rides/${ride.id}/preview`}
            className="text-xs font-medium text-gray-900 hover:underline"
          >
            Preview forecast
          </Link>
          <form action={deleteRide}>
            <input type="hidden" name="id" value={ride.id} />
            <button type="submit" className="text-xs text-red-600 hover:underline">
              Delete
            </button>
          </form>
        </div>
      </div>
    </li>
  );
}
