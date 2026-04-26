"use client";

import { useActionState } from "react";
import { emailVerdict, type EmailVerdictState } from "./actions";

const INITIAL: EmailVerdictState = { status: "idle" };

export function EmailButton({ rideId }: { rideId: string }) {
  const [state, formAction, pending] = useActionState(emailVerdict, INITIAL);

  return (
    <form action={formAction} className="flex items-center gap-3">
      <input type="hidden" name="ride_id" value={rideId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
      >
        {pending ? "Sending…" : "Email this verdict to me"}
      </button>
      {state.message ? (
        <span
          role="status"
          className={state.status === "error" ? "text-sm text-red-600" : "text-sm text-green-700"}
        >
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
