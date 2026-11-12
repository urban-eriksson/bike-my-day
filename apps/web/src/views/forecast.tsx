import { Link, useParams } from "react-router";
import { SnapshotDetails, Verdict } from "@/components/forecast";
import { Page } from "@/components/page";
import { Spinner } from "@/components/ui/spinner";
import { api, type StoredForecast } from "@/lib/api";
import { useT } from "@/lib/i18n/provider";
import { useLoad } from "@/lib/use-load";
import { useTitle } from "@/lib/use-title";

/**
 * The page a push notification opens: the latest *stored* forecast for the
 * ride, so what you see is exactly what was pushed. Same path as before the
 * move, so notifications already on phones still open it.
 */
export function ForecastView() {
  const t = useT();
  const { id = "" } = useParams();
  useTitle(t.meta.forecast);
  const forecast = useLoad(`forecast:${id}`, () => api<StoredForecast>(`/rides/${id}/forecast`));

  return (
    <Page back>
      <h1 className="font-heading text-2xl font-semibold">{t.forecast.title}</h1>
      {forecast.status === "loading" ? (
        <div role="status" className="mt-10 flex justify-center">
          <Spinner className="size-7 text-primary" />
        </div>
      ) : forecast.status === "error" ? (
        <p className="mt-6 text-sm text-destructive">{t.forecast.notFound}.</p>
      ) : (
        <>
          <p className="mt-1 text-[0.95rem] text-muted-foreground">
            <span className="font-medium text-foreground">{forecast.data.ride.label}</span> ·{" "}
            {forecast.data.ride.start_address} → {forecast.data.ride.end_address}
          </p>
          {forecast.data.notification?.verdict_text ? (
            <div className="mt-6">
              <Verdict
                score={forecast.data.notification.score}
                text={forecast.data.notification.verdict_text}
                t={t}
              />
              <SnapshotDetails snapshot={forecast.data.notification.forecast_json} t={t} />
            </div>
          ) : (
            <p className="mt-6 text-[0.95rem] text-muted-foreground">
              {t.forecast.none}{" "}
              <Link
                to={`/rides/${id}/preview`}
                className="font-medium text-primary underline underline-offset-2"
              >
                {t.forecast.generateNow}
              </Link>
              .
            </p>
          )}
        </>
      )}
    </Page>
  );
}
