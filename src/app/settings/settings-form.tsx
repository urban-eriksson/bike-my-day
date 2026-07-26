"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/components/i18n-provider";
import { saveProfile, type SaveProfileState } from "./actions";

const INITIAL: SaveProfileState = { status: "idle" };

export function SettingsForm({ initialPreferences }: { initialPreferences: string }) {
  const t = useT();
  const [state, formAction, pending] = useActionState(saveProfile, INITIAL);

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-3">
      <Textarea
        name="preferences"
        rows={6}
        defaultValue={initialPreferences}
        placeholder={t.settings.prefsPlaceholder}
      />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? t.ride.saving : t.settings.savePrefs}
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
    </form>
  );
}
