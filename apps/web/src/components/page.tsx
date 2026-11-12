import type { ReactNode } from "react";
import { AppHeader } from "@/components/app-header";
import { cn } from "@/lib/utils";

/** The signed-in page frame: header, then a centred column. */
export function Page({
  back = false,
  narrow = false,
  children,
}: {
  back?: boolean;
  narrow?: boolean;
  children: ReactNode;
}) {
  return (
    <>
      <AppHeader back={back} />
      <main
        className={cn("mx-auto w-full px-4 pt-6 pb-16 sm:px-6", narrow ? "max-w-xl" : "max-w-2xl")}
      >
        {children}
      </main>
    </>
  );
}
