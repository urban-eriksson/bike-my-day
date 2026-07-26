"use client";

import Link from "next/link";
import { ArrowLeft, Languages, LogOut, Settings, SlidersHorizontal, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { deleteAccount, signOut } from "@/app/dashboard/actions";
import { setLocale } from "@/app/locale-actions";
import { useI18n } from "@/components/i18n-provider";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";

/**
 * Shared top bar for signed-in pages. Sticky with safe-area padding so it
 * sits under the iOS status bar in standalone (home-screen) mode.
 *
 * Pass `back` on any page below the dashboard: the wordmark keeps its place
 * and its job (it already goes home) and gains a leading arrow, so there is
 * one obvious way back rather than two competing ones.
 */
export function AppHeader({ back = false }: { back?: boolean }) {
  const { locale, t } = useI18n();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const other = locale === "sv" ? "en" : "sv";

  return (
    <header className="sticky top-0 z-40 bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/dashboard"
          aria-label={back ? t.nav.backToRides : t.nav.yourRides}
          className="group -ml-1 flex items-center gap-1.5 rounded-md py-1 pr-2 pl-1 font-heading text-lg font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {back ? (
            <ArrowLeft
              aria-hidden
              className="size-5 text-primary transition-transform duration-150 group-hover:-translate-x-0.5 motion-reduce:transition-none"
            />
          ) : null}
          {t.nav.brand}
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={t.nav.menu}>
              <Settings className="size-5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <SlidersHorizontal /> {t.nav.preferences}
              </Link>
            </DropdownMenuItem>
            {/* Two languages, so one item that names the other one is clearer
                than a submenu — and it is a single tap on a phone. */}
            <DropdownMenuItem onSelect={() => startTransition(() => setLocale(other))}>
              <Languages /> {t.nav.switchTo}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => startTransition(() => signOut())}>
              <LogOut /> {t.nav.signOut}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
              <Trash2 /> {t.nav.deleteAccount}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Horizon line: the header's only decoration. */}
      <div
        aria-hidden
        className="h-px bg-gradient-to-r from-transparent via-primary/45 to-transparent"
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteAccountDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>{t.deleteAccountDialog.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{t.deleteAccountDialog.cancel}</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => startTransition(() => deleteAccount())}
            >
              {pending ? (
                <>
                  <Spinner /> {t.deleteAccountDialog.working}
                </>
              ) : (
                t.deleteAccountDialog.confirm
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}
