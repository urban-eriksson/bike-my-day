import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { NewRideForm } from "@/components/new-ride-form";
import { PreferencesForm } from "@/components/preferences-form";
import { PushToggle } from "@/components/push-toggle";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/provider";
import { useSession } from "@/lib/session";
import { useTitle } from "@/lib/use-title";

/**
 * One-time three-step onboarding: preferences → notifications → first ride.
 * Every step is skippable; creating the ride lands on the dashboard.
 */
export function WelcomeView() {
  const t = useT();
  const navigate = useNavigate();
  const { session, refresh } = useSession();
  useTitle(t.meta.welcome);
  const me = session.status === "signed-in" ? session.me : null;
  const hasPreferences = (me?.profile.preferences ?? "").trim() !== "";
  // Read once: saving preferences in step 1 must not bounce the rider out.
  const [established] = useState(hasPreferences && (me?.rides ?? 0) > 0);
  const [step, setStep] = useState(1);
  const [prefsDone, setPrefsDone] = useState(hasPreferences);

  if (established) return <Navigate to="/dashboard" replace />;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="font-heading text-2xl font-semibold">{t.welcome.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t.welcome.subtitle}</p>

      <div className="mt-8">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {t.welcome.step(step, 3)}
        </p>

        {step === 1 ? (
          <section className="mt-4">
            <h2 className="font-heading text-xl font-semibold">{t.welcome.prefsHeading}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t.welcome.prefsHelp}</p>
            <PreferencesForm
              rows={5}
              saveLabel={t.welcome.save}
              onSaved={() => setPrefsDone(true)}
            />
            <div className="mt-3">
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
            </div>
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
            <NewRideForm
              onCreated={() => {
                void refresh();
                navigate("/dashboard");
              }}
            />
            <p className="mt-4 text-sm">
              <Link to="/dashboard" className="text-muted-foreground underline">
                {t.welcome.skip}
              </Link>
            </p>
          </section>
        ) : null}
      </div>
    </main>
  );
}
