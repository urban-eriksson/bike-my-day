"use client";

import { useActionState, useState } from "react";
import {
  sendLoginCode,
  verifyLoginCode,
  type SendCodeState,
  type VerifyCodeState,
} from "./actions";

const INITIAL_SEND: SendCodeState = { status: "idle" };
const INITIAL_VERIFY: VerifyCodeState = { status: "idle" };

/**
 * One form, two submit buttons routed to different server actions
 * (React 19 formAction). The email is a controlled input — React resets
 * uncontrolled fields after each form action, which would blank it right
 * when the code step appears. During the code step it turns read-only
 * (not disabled: read-only fields still submit their value).
 */
export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [sendState, sendAction, sendPending] = useActionState(sendLoginCode, INITIAL_SEND);
  const [verifyState, verifyAction, verifyPending] = useActionState(
    verifyLoginCode,
    INITIAL_VERIFY,
  );

  const codeSent = sendState.status === "sent";
  const pending = sendPending || verifyPending;

  return (
    <form className="mt-6 flex flex-col gap-3">
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
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        readOnly={codeSent}
        disabled={pending}
        className={`rounded border border-gray-300 px-3 py-2 text-sm ${
          codeSent ? "bg-gray-100 text-gray-500" : ""
        }`}
        placeholder="you@example.com"
      />
      {codeSent ? (
        <a href="/login" className="-mt-1 text-xs text-gray-600 underline">
          Use a different email
        </a>
      ) : null}

      {codeSent ? (
        <>
          <label htmlFor="token" className="text-sm font-medium">
            One-time code
          </label>
          <input
            id="token"
            name="token"
            inputMode="numeric"
            pattern="[0-9]{6,10}"
            maxLength={10}
            autoComplete="one-time-code"
            required
            disabled={pending}
            className="rounded border border-gray-300 px-3 py-2 text-sm tracking-widest"
            placeholder="12345678"
          />
          <button
            type="submit"
            formAction={verifyAction}
            disabled={pending}
            className="rounded bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {verifyPending ? "Signing in…" : "Sign in"}
          </button>
        </>
      ) : null}

      <button
        type="submit"
        formAction={sendAction}
        formNoValidate={codeSent}
        disabled={pending}
        className={
          codeSent
            ? "rounded border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
            : "rounded bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        }
      >
        {sendPending ? "Sending…" : codeSent ? "Send a new code" : "Email me a code"}
      </button>

      {sendState.message ? (
        <p
          role="status"
          className={
            sendState.status === "error" ? "text-sm text-red-600" : "text-sm text-green-700"
          }
        >
          {sendState.message}
        </p>
      ) : null}
      {verifyState.message ? (
        <p role="status" className="text-sm text-red-600">
          {verifyState.message}
        </p>
      ) : null}
    </form>
  );
}
