import { useState } from "react";
import { useParams } from "react-router";
import { SnapshotDetails, Verdict } from "@/components/forecast";
import { Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, api, type Preview } from "@/lib/api";
import { errorText } from "@/lib/errors";
import { useT } from "@/lib/i18n/provider";
import { useLoad } from "@/lib/use-load";
import { useTitle } from "@/lib/use-title";

/**
 * A live forecast for the next departure: a weather fetch plus a model call,
 * several seconds on a phone, so the frame is on screen while it runs.
 */
export function PreviewView() {
  const t = useT();
  const { id = "" } = useParams();
  useTitle(t.meta.forecast);
  const preview = useLoad(`preview:${id}`, () => api<Preview>(`/rides/${id}/preview`));

  return (
    <Page back>
      <h1 className="font-heading text-2xl font-semibold">{t.forecast.title}</h1>
      {preview.status === "loading" ? (
        <div role="status" className="mt-10 flex flex-col items-center gap-3 text-center">
          <Spinner className="size-7 text-primary" />
          <p className="text-base text-muted-foreground">{t.forecast.loading}</p>
        </div>
      ) : preview.status === "error" ? (
        <p className="mt-6 text-sm text-destructive">
          {preview.error instanceof ApiError && preview.error.status === 404
            ? `${t.forecast.notFound}.`
            : t.forecast.failed(
                preview.error instanceof ApiError && typeof preview.error.detail === "string"
                  ? preview.error.detail
                  : errorText(preview.error, t),
              )}
        </p>
      ) : (
        <>
          <p className="mt-1 text-[0.95rem] text-muted-foreground">
            <span className="font-medium text-foreground">{preview.data.ride.label}</span> ·{" "}
            {preview.data.ride.start_address} → {preview.data.ride.end_address}
          </p>
          <div className="mt-6">
            <Verdict score={preview.data.score} text={preview.data.text} t={t} />
            <SnapshotDetails snapshot={preview.data.snapshot} t={t} />
            <p className="mt-6 text-xs text-muted-foreground/70">
              {t.forecast.tokens(preview.data.usage.input_tokens, preview.data.usage.output_tokens)}
            </p>
            <div className="mt-6">
              <PushButton preview={preview.data} />
            </div>
          </div>
        </>
      )}
    </Page>
  );
}

/**
 * Pushes the verdict on screen rather than a fresh one: a second model call
 * would cost twice and say something different from what the rider just read.
 */
function PushButton({ preview }: { preview: Preview }) {
  const t = useT();
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<{ text: string; isError: boolean } | null>(null);
  const s = preview.snapshot;

  async function send() {
    setPending(true);
    setStatus(null);
    try {
      await api(`/rides/${preview.ride.id}/push`, {
        method: "POST",
        body: {
          text: preview.text,
          score: preview.score,
          when_local: s.as_of_local,
          details: {
            temperature_c: s.temperature_c,
            apparent_temperature_c: s.apparent_temperature_c,
            precipitation_mm: s.precipitation_mm,
            wind_speed_ms: s.wind_speed_ms,
            wind_gusts_ms: s.wind_gusts_ms,
          },
        },
      });
      setStatus({ text: t.errors.pushed, isError: false });
    } catch (err) {
      setStatus({ text: errorText(err, t), isError: true });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
      <Button type="button" variant="outline" disabled={pending} onClick={() => void send()}>
        {pending ? (
          <>
            <Spinner /> {t.forecast.sendingPush}
          </>
        ) : (
          t.forecast.sendPush
        )}
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
  );
}
