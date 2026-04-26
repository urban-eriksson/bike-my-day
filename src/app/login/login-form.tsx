"use client";

import { useActionState } from "react";
import { sendMagicLink, type SendMagicLinkState } from "./actions";

const INITIAL: SendMagicLinkState = { status: "idle" };

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(sendMagicLink, INITIAL);

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      <label htmlFor="email" className="text-sm font-medium">
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        disabled={pending || state.status === "sent"}
        className="rounded border border-gray-300 px-3 py-2 text-sm"
        placeholder="you@example.com"
      />
      <button
        type="submit"
        disabled={pending || state.status === "sent"}
        className="rounded bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send magic link"}
      </button>
      {state.message ? (
        <p
          role="status"
          className={state.status === "error" ? "text-sm text-red-600" : "text-sm text-green-700"}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
