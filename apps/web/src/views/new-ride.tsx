import { useNavigate } from "react-router";
import { NewRideForm } from "@/components/new-ride-form";
import { Page } from "@/components/page";
import { PushToggle } from "@/components/push-toggle";
import { useT } from "@/lib/i18n/provider";
import { useTitle } from "@/lib/use-title";

export function NewRideView() {
  const t = useT();
  const navigate = useNavigate();
  useTitle(t.meta.newRide);
  return (
    <Page back narrow>
      <h1 className="font-heading text-2xl font-semibold">{t.ride.newTitle}</h1>
      <p className="mt-2 text-[0.95rem] text-muted-foreground">{t.ride.newHelp}</p>
      <NewRideForm onCreated={() => navigate("/dashboard")} />
      <div className="mt-8 border-t border-border pt-4">
        <PushToggle hideWhenSubscribed />
      </div>
    </Page>
  );
}
