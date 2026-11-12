import { type FormEvent, useState } from "react";
import { Navigate, useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { errorText } from "@/lib/errors";
import { useI18n } from "@/lib/i18n/provider";
import { useSession } from "@/lib/session";
import { useTitle } from "@/lib/use-title";
import { Glow } from "./home";

/**
 * Email, then a six-digit code typed into the same screen. A code (not a link)
 * works in the installed iOS app, whose storage a link opened in Safari can
 * never reach.
 */
export function LoginView() {
  const { t, locale } = useI18n();
  const { session, signIn } = useSession();
  const [params] = useSearchParams();
  const nextParam = params.get("next") ?? "/dashboard";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/dashboard";
  useTitle(t.meta.signIn);

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [pending, setPending] = useState<"send" | "verify" | null>(null);
  const [status, setStatus] = useState<{ text: string; isError: boolean } | null>(null);

  if (session.status === "signed-in") return <Navigate to={next} replace />;

  async function sendCode() {
    if (!email.includes("@")) return;
    setPending("send");
    setStatus(null);
    try {
      await api("/auth/code", { method: "POST", body: { email: email.trim(), locale } });
      setCodeSent(true);
      setStatus({ text: t.login.codeSent(email.trim()), isError: false });
    } catch (err) {
      setStatus({ text: errorText(err, t), isError: true });
    } finally {
      setPending(null);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!codeSent) {
      await sendCode();
      return;
    }
    setPending("verify");
    setStatus(null);
    try {
      const res = await api<{ token: string }>("/auth/verify", {
        method: "POST",
        body: { email: email.trim(), code: code.trim() },
      });
      await signIn(res.token);
    } catch (err) {
      setStatus({ text: errorText(err, t), isError: true });
      setPending(null);
    }
  }

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center overflow-hidden px-6 py-12">
      <Glow />
      <h1 className="font-heading text-2xl font-semibold">{t.login.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t.login.subtitle}</p>
      <form className="mt-6 flex flex-col gap-3" onSubmit={verify}>
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
          disabled={pending !== null}
          className={codeSent ? "bg-muted text-muted-foreground" : undefined}
          placeholder={t.login.emailPlaceholder}
        />
        {codeSent ? (
          <button
            type="button"
            className="-mt-1 self-start text-xs text-muted-foreground underline"
            onClick={() => {
              setCodeSent(false);
              setCode("");
              setStatus(null);
            }}
          >
            {t.login.useDifferentEmail}
          </button>
        ) : null}

        {codeSent ? (
          <>
            <Label htmlFor="token">{t.login.code}</Label>
            <Input
              id="token"
              name="token"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={pending !== null}
              className="tracking-widest"
              placeholder={t.login.codePlaceholder}
            />
            <Button type="submit" disabled={pending !== null}>
              {pending === "verify" ? t.login.signingIn : t.login.signIn}
            </Button>
          </>
        ) : null}

        <Button
          type={codeSent ? "button" : "submit"}
          onClick={codeSent ? () => void sendCode() : undefined}
          disabled={pending !== null}
          variant={codeSent ? "outline" : "default"}
        >
          {pending === "send"
            ? t.login.sending
            : codeSent
              ? t.login.sendNewCode
              : t.login.emailMeCode}
        </Button>

        {status ? (
          <p
            role="status"
            className={
              status.isError ? "text-sm text-destructive" : "text-sm font-medium text-primary"
            }
          >
            {status.text}
          </p>
        ) : null}
      </form>
    </main>
  );
}
