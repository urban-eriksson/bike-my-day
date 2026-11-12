import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useT } from "@/lib/i18n/provider";
import { useSession } from "@/lib/session";
import { DashboardView } from "@/views/dashboard";
import { ForecastView } from "@/views/forecast";
import { HomeView } from "@/views/home";
import { LoginView } from "@/views/login";
import { NewRideView } from "@/views/new-ride";
import { PreviewView } from "@/views/preview";
import { SettingsView } from "@/views/settings";
import { WelcomeView } from "@/views/welcome";

/**
 * The paths are the Next.js app's paths. Notifications already on phones open
 * /rides/<id>/forecast, and the installed app starts at /dashboard.
 */
export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomeView />} />
        <Route path="/login" element={<LoginView />} />
        <Route
          path="/welcome"
          element={
            <SignedIn>
              <WelcomeView />
            </SignedIn>
          }
        />
        <Route
          path="/dashboard"
          element={
            <SignedIn>
              <DashboardView />
            </SignedIn>
          }
        />
        <Route
          path="/settings"
          element={
            <SignedIn>
              <SettingsView />
            </SignedIn>
          }
        />
        <Route
          path="/rides/new"
          element={
            <SignedIn>
              <NewRideView />
            </SignedIn>
          }
        />
        <Route
          path="/rides/:id/preview"
          element={
            <SignedIn>
              <PreviewView />
            </SignedIn>
          }
        />
        <Route
          path="/rides/:id/forecast"
          element={
            <SignedIn>
              <ForecastView />
            </SignedIn>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

function SignedIn({ children }: { children: ReactNode }) {
  const t = useT();
  const { session, refresh } = useSession();
  const location = useLocation();

  if (session.status === "loading") {
    return (
      <div role="status" className="flex flex-1 items-center justify-center">
        <Spinner className="size-7 text-primary" />
      </div>
    );
  }
  if (session.status === "offline") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="max-w-xs text-sm text-muted-foreground">{t.errors.offline}</p>
        <Button type="button" variant="outline" onClick={() => void refresh()}>
          {t.errors.retry}
        </Button>
      </div>
    );
  }
  if (session.status === "signed-out") {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return children;
}
