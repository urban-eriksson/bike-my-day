import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { SnapshotDetails, Verdict } from "@/components/forecast";
import type { Dictionary } from "@/lib/i18n/dictionary";
import { getT } from "@/lib/i18n/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { WeatherSnapshot } from "@/lib/weather/types";

export async function generateMetadata() {
  return { title: (await getT()).meta.forecast };
}
export const dynamic = "force-dynamic";

/**
 * The page a push notification opens: the latest *stored* forecast for the
 * ride (from the cron's notifications row) — no LLM re-run, so what you see
 * is exactly what was pushed.
 */
export default async function ForecastPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getT();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: ride } = await supabase
    .from("rides")
    .select("id, label, start_address, end_address")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!ride) {
    return (
      <Frame t={t}>
        <p className="mt-6 text-sm text-destructive">{t.forecast.notFound}.</p>
      </Frame>
    );
  }

  const { data: notification } = await supabase
    .from("notifications")
    .select("verdict_text, score, forecast_json, scheduled_for, sent_at")
    .eq("ride_id", ride.id)
    .not("sent_at", "is", null)
    .order("scheduled_for", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <Frame t={t}>
      <p className="mt-1 text-[0.95rem] text-muted-foreground">
        <span className="font-medium text-foreground">{ride.label}</span> · {ride.start_address} →{" "}
        {ride.end_address}
      </p>

      {notification?.verdict_text ? (
        <div className="mt-6">
          <Verdict score={notification.score} text={notification.verdict_text} t={t} />
          <SnapshotDetails
            snapshot={notification.forecast_json as unknown as WeatherSnapshot}
            t={t}
          />
        </div>
      ) : (
        <p className="mt-6 text-[0.95rem] text-muted-foreground">
          {t.forecast.none}{" "}
          <Link
            href={`/rides/${ride.id}/preview`}
            className="font-medium text-primary underline underline-offset-2"
          >
            {t.forecast.generateNow}
          </Link>
          .
        </p>
      )}
    </Frame>
  );
}

function Frame({ children, t }: { children: React.ReactNode; t: Dictionary }) {
  return (
    <>
      <AppHeader back />
      <main className="mx-auto w-full max-w-2xl px-4 pt-6 pb-16 sm:px-6">
        <h1 className="font-heading text-2xl font-semibold">{t.forecast.title}</h1>
        {children}
      </main>
    </>
  );
}
