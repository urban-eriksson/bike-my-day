"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/components/i18n-provider";
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
  const t = useT();
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
      <Label htmlFor="email">{t.login.email}</Label>
      <Input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        readOnly={codeSent}
        disabled={pending}
        className={codeSent ? "bg-muted text-muted-foreground" : undefined}
        placeholder={t.login.emailPlaceholder}
      />
      {codeSent ? (
        <a href="/login" className="-mt-1 text-xs text-muted-foreground underline">
          {t.login.useDifferentEmail}
        </a>
      ) : null}

      {codeSent ? (
        <>
          <Label htmlFor="token">{t.login.code}</Label>
          <Input
            id="token"
            name="token"
            inputMode="numeric"
            pattern="[0-9]{6,10}"
            maxLength={10}
            autoComplete="one-time-code"
            required
            disabled={pending}
            className="tracking-widest"
            placeholder={t.login.codePlaceholder}
          />
          <Button type="submit" formAction={verifyAction} disabled={pending}>
            {verifyPending ? t.login.signingIn : t.login.signIn}
          </Button>
        </>
      ) : null}

      <Button
        type="submit"
        formAction={sendAction}
        formNoValidate={codeSent}
        disabled={pending}
        variant={codeSent ? "outline" : "default"}
      >
        {sendPending ? t.login.sending : codeSent ? t.login.sendNewCode : t.login.emailMeCode}
      </Button>

      {sendState.message ? (
        <p
          role="status"
          className={
            sendState.status === "error"
              ? "text-sm text-destructive"
              : "text-sm font-medium text-primary"
          }
        >
          {sendState.message}
        </p>
      ) : null}
      {verifyState.message ? (
        <p role="status" className="text-sm text-destructive">
          {verifyState.message}
        </p>
      ) : null}
    </form>
  );
}
