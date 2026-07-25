"use client";

import Link, { useLinkStatus } from "next/link";
import { CloudSun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * The forecast page runs the weather fetch and the LLM call while it renders,
 * so the tap is followed by a real wait. `loading.tsx` covers the destination;
 * this covers the moment before the navigation commits, so the press is
 * acknowledged instantly. Icon and spinner are the same size — no reflow.
 */
function Label() {
  const { pending } = useLinkStatus();
  return (
    <>
      {pending ? <Spinner /> : <CloudSun aria-hidden />}
      {pending ? "Reading the sky…" : "Forecast"}
    </>
  );
}

export function ForecastButton({ rideId }: { rideId: string }) {
  return (
    <Button asChild size="sm">
      {/* Without prefetch the pending state would be skipped on a warm cache. */}
      <Link href={`/rides/${rideId}/preview`} prefetch={false}>
        <Label />
      </Link>
    </Button>
  );
}
