"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { geocodeAddress } from "@/lib/geo/geocode";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CreateRideState = {
  status: "idle" | "error";
  message?: string;
  /** Echo back submitted values so the form can re-render with them. */
  values?: {
    label?: string;
    start_address?: string;
    end_address?: string;
    depart_local_time?: string;
    days_of_week?: number[];
    timezone?: string;
  };
};

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

function parseDays(formData: FormData): number[] {
  const raw = formData.getAll("days_of_week").map(String);
  const parsed = raw
    .map((s) => Number.parseInt(s, 10))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  return Array.from(new Set(parsed)).sort();
}

export async function createRide(
  _prev: CreateRideState,
  formData: FormData,
): Promise<CreateRideState> {
  const label = String(formData.get("label") ?? "").trim();
  const start_address = String(formData.get("start_address") ?? "").trim();
  const end_address = String(formData.get("end_address") ?? "").trim();
  const depart_local_time = String(formData.get("depart_local_time") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim();
  const days_of_week = parseDays(formData);

  const echo: CreateRideState["values"] = {
    label,
    start_address,
    end_address,
    depart_local_time,
    days_of_week,
    timezone,
  };

  if (!label) return { status: "error", message: "Label is required.", values: echo };
  if (!start_address || !end_address) {
    return { status: "error", message: "Start and end addresses are required.", values: echo };
  }
  if (!/^\d{2}:\d{2}$/.test(depart_local_time)) {
    return { status: "error", message: "Depart time must be HH:MM.", values: echo };
  }
  if (days_of_week.length === 0) {
    return { status: "error", message: "Pick at least one day of the week.", values: echo };
  }
  if (!timezone) {
    return { status: "error", message: "Could not detect your timezone.", values: echo };
  }
  if (!ALL_DAYS.every((d) => d >= 0 && d <= 6)) {
    // sanity, shouldn't trip
    return { status: "error", message: "Invalid day-of-week value.", values: echo };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const [startHits, endHits] = await Promise.all([
    geocodeAddress(start_address),
    geocodeAddress(end_address, { count: 1 }),
  ]);
  const start = startHits[0];
  const end = endHits[0];
  if (!start) {
    return {
      status: "error",
      message: `Couldn't find a place matching "${start_address}". Try a city or town name.`,
      values: echo,
    };
  }
  if (!end) {
    return {
      status: "error",
      message: `Couldn't find a place matching "${end_address}". Try a city or town name.`,
      values: echo,
    };
  }

  const { error } = await supabase.from("rides").insert({
    user_id: user.id,
    label,
    start_address: start.label,
    start_lat: start.latitude,
    start_lon: start.longitude,
    end_address: end.label,
    end_lat: end.latitude,
    end_lon: end.longitude,
    depart_local_time: `${depart_local_time}:00`,
    days_of_week,
    timezone,
    active: true,
  });
  if (error) {
    return { status: "error", message: error.message, values: echo };
  }

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function deleteRide(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // RLS already restricts to owner, but pass user_id for an extra guard.
  await supabase.from("rides").delete().eq("id", id).eq("user_id", user.id);
  revalidatePath("/dashboard");
}
