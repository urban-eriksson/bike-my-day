import { Page } from "@/components/page";
import { PreferencesForm } from "@/components/preferences-form";
import { PushToggle } from "@/components/push-toggle";
import { useT } from "@/lib/i18n/provider";
import { useSession } from "@/lib/session";
import { useTitle } from "@/lib/use-title";

export function SettingsView() {
  const t = useT();
  const { session } = useSession();
  useTitle(t.meta.preferences);
  const email = session.status === "signed-in" ? session.me.user.email : "";
  return (
    <Page back>
      <h1 className="font-heading text-2xl font-semibold">{t.settings.title}</h1>
      <p className="mt-2 text-[0.95rem] text-muted-foreground">
        {t.settings.signedInAs} <span className="font-medium text-foreground">{email}</span>
      </p>

      <h2 className="mt-9 text-xl font-semibold">{t.settings.prefsHeading}</h2>
      <p className="mt-1.5 text-[0.95rem] text-muted-foreground">
        {t.settings.prefsHelp} <em>{t.settings.prefsExample}</em>
      </p>
      <PreferencesForm saveLabel={t.settings.savePrefs} />

      <h2 className="mt-11 text-xl font-semibold">{t.settings.notificationsHeading}</h2>
      <p className="mt-1.5 text-[0.95rem] text-muted-foreground">{t.settings.notificationsHelp}</p>
      <PushToggle />
    </Page>
  );
}
