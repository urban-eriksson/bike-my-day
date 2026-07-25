import { AppHeader } from "@/components/app-header";
import { Spinner } from "@/components/ui/spinner";

/**
 * The forecast is generated during render — a weather fetch plus an LLM call,
 * several seconds on a phone. This puts the page frame on screen immediately
 * so the wait happens inside the app instead of before it.
 */
export default function PreviewLoading() {
  return (
    <>
      <AppHeader back />
      <main className="mx-auto w-full max-w-2xl px-4 pt-6 pb-16 sm:px-6">
        <h1 className="font-heading text-2xl font-semibold">Forecast</h1>
        <div role="status" className="mt-10 flex flex-col items-center gap-3 text-center">
          <Spinner className="size-7 text-primary" />
          <p className="text-base text-muted-foreground">
            Checking the weather and making the call…
          </p>
        </div>
      </main>
    </>
  );
}
