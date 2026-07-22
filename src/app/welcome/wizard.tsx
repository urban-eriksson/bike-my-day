"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { saveProfile, type SaveProfileState } from "@/app/settings/actions";
import { NewRideForm } from "@/app/rides/new/new-ride-form";
import { PushToggle } from "@/components/push-toggle";

const INITIAL: SaveProfileState = { status: "idle" };

/**
 * One-time three-step onboarding: preferences → notifications → first ride.
 * Every step is skippable; finishing step 3 lands on the dashboard via
 * NewRideForm's own redirect.
 */
export function WelcomeWizard({
  initialPreferences,
  hasPreferences,
}: {
  initialPreferences: string;
  hasPreferences: boolean;
}) {
  const [step, setStep] = useState(1);
  const [prefsState, prefsAction, prefsPending] = useActionState(saveProfile, INITIAL);

  const prefsDone = hasPreferences || prefsState.status === "saved";

  return (
    <div className="mt-8">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Step {step} of 3
      </p>

      {step === 1 ? (
        <section className="mt-4">
          <h2 className="text-lg font-semibold">What makes or breaks a ride for you?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your words go straight to the forecast generator, so be specific — temperatures, rain,
            wind, darkness, whatever matters to you.
          </p>
          <form action={prefsAction} className="mt-4 flex flex-col gap-3">
            <textarea
              name="preferences"
              rows={5}
              defaultValue={initialPreferences}
              placeholder="I hate riding under 5 °C. Fine in light rain. Anything over 8 m/s headwind is a no."
              className="rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={prefsPending}
                className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {prefsPending ? "Saving…" : "Save"}
              </button>
              {prefsDone ? (
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-secondary"
                >
                  Continue →
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="text-sm text-muted-foreground underline"
                >
                  Skip for now
                </button>
              )}
              {prefsState.message && prefsState.status === "error" ? (
                <span role="status" className="text-sm text-destructive">
                  {prefsState.message}
                </span>
              ) : null}
            </div>
          </form>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="mt-4">
          <h2 className="text-lg font-semibold">Get forecasts on this phone</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The nightly forecast arrives as a notification — no need to open the app.
          </p>
          <PushToggle />
          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setStep(3)}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Continue →
            </button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="mt-4">
          <h2 className="text-lg font-semibold">Your first ride</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A recurring ride — like the commute — gets a fresh forecast every night before it.
          </p>
          <NewRideForm />
          <p className="mt-4 text-sm">
            <Link href="/dashboard" className="text-muted-foreground underline">
              Skip for now
            </Link>
          </p>
        </section>
      ) : null}
    </div>
  );
}
