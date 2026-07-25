"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { saveProfile, type SaveProfileState } from "./actions";

const INITIAL: SaveProfileState = { status: "idle" };

export function SettingsForm({ initialPreferences }: { initialPreferences: string }) {
  const [state, formAction, pending] = useActionState(saveProfile, INITIAL);

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-3">
      <Textarea
        name="preferences"
        rows={6}
        defaultValue={initialPreferences}
        placeholder="I hate riding under 5 °C. Fine in light rain. Anything over 8 m/s headwind is a no."
      />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save preferences"}
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
