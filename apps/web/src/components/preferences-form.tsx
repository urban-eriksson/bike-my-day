import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api, type Profile } from "@/lib/api";
import { errorText } from "@/lib/errors";
import { useT } from "@/lib/i18n/provider";
import { useSession } from "@/lib/session";

/** The free-text preferences, used by Settings and the welcome wizard. */
export function PreferencesForm({
  saveLabel,
  rows = 6,
  onSaved,
}: {
  saveLabel: string;
  rows?: number;
  onSaved?: () => void;
}) {
  const t = useT();
  const { session, setProfile } = useSession();
  const initial = session.status === "signed-in" ? session.me.profile.preferences : "";
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<{ text: string; isError: boolean } | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const preferences = String(new FormData(e.currentTarget).get("preferences") ?? "");
    setPending(true);
    setStatus(null);
    try {
      const profile = await api<Profile>("/me/profile", { method: "PUT", body: { preferences } });
      setProfile(profile);
      setStatus({ text: t.errors.saved, isError: false });
      onSaved?.();
    } catch (err) {
      setStatus({ text: errorText(err, t), isError: true });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
      <Textarea
        name="preferences"
        rows={rows}
        maxLength={4000}
        defaultValue={initial}
        placeholder={t.settings.prefsPlaceholder}
      />
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <Button type="submit" disabled={pending}>
          {pending ? t.ride.saving : saveLabel}
        </Button>
        {status ? (
          <span
            role="status"
            className={
              status.isError ? "text-sm text-destructive" : "text-sm font-medium text-primary"
            }
          >
            {status.text}
          </span>
        ) : null}
      </div>
    </form>
  );
}
