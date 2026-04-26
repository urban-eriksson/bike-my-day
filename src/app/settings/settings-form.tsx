"use client";

import { useActionState } from "react";
import { saveProfile, type SaveProfileState } from "./actions";

const INITIAL: SaveProfileState = { status: "idle" };

export function SettingsForm({ initialPreferences }: { initialPreferences: string }) {
  const [state, formAction, pending] = useActionState(saveProfile, INITIAL);

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-3">
      <textarea
        name="preferences"
        rows={6}
        defaultValue={initialPreferences}
        placeholder="I hate riding under 5 °C. Fine in light rain. Anything over 8 m/s headwind is a no."
        className="rounded border border-gray-300 px-3 py-2 text-sm"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save preferences"}
        </button>
        {state.message ? (
          <span
            role="status"
            className={state.status === "error" ? "text-sm text-red-600" : "text-sm text-green-700"}
          >
            {state.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}
