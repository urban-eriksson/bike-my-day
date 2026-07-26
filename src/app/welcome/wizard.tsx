"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { saveProfile, type SaveProfileState } from "@/app/settings/actions";
import { NewRideForm } from "@/app/rides/new/new-ride-form";
import { PushToggle } from "@/components/push-toggle";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/components/i18n-provider";

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
  const t = useT();
  const [step, setStep] = useState(1);
  const [prefsState, prefsAction, prefsPending] = useActionState(saveProfile, INITIAL);

  const prefsDone = hasPreferences || prefsState.status === "saved";

  return (
    <div className="mt-8">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {t.welcome.step(step, 3)}
      </p>

      {step === 1 ? (
        <section className="mt-4">
          <h2 className="font-heading text-xl font-semibold">{t.welcome.prefsHeading}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t.welcome.prefsHelp}</p>
          <form action={prefsAction} className="mt-4 flex flex-col gap-3">
            <Textarea
              name="preferences"
              rows={5}
              defaultValue={initialPreferences}
              placeholder={t.settings.prefsPlaceholder}
            />
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={prefsPending}>
                {prefsPending ? t.welcome.saving : t.welcome.save}
              </Button>
              {prefsDone ? (
                <Button type="button" variant="outline" onClick={() => setStep(2)}>
                  {t.welcome.continue}
                </Button>
              ) : (
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="text-sm text-muted-foreground underline"
                >
                  {t.welcome.skip}
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
          <h2 className="font-heading text-xl font-semibold">{t.welcome.pushHeading}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t.welcome.pushHelp}</p>
          <PushToggle />
          <div className="mt-6 flex items-center gap-3">
            <Button type="button" onClick={() => setStep(3)}>
              {t.welcome.continue}
            </Button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="mt-4">
          <h2 className="font-heading text-xl font-semibold">{t.welcome.rideHeading}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t.welcome.rideHelp}</p>
          <NewRideForm />
          <p className="mt-4 text-sm">
            <Link href="/dashboard" className="text-muted-foreground underline">
              {t.welcome.skip}
            </Link>
          </p>
        </section>
      ) : null}
    </div>
  );
}
